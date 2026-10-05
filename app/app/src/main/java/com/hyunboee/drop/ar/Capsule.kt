package com.hyunboee.drop.ar

import android.graphics.Bitmap
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.google.ar.core.Anchor
import com.google.ar.core.Pose
import kotlin.math.abs

// 캡슐 등급. 서버의 grade 값과 같다 (docs/1-domain-definition.md 5.1, docs/13-capsule-dev-plan.md 19장)
internal const val BRONZE = "BRONZE"
internal const val SILVER = "SILVER"
internal const val DIAMOND = "DIAMOND"

internal val GRADES = listOf(BRONZE, SILVER, DIAMOND)

internal fun gradeLabel(grade: String) = when (grade) {
    SILVER -> "실버"
    DIAMOND -> "다이아"
    else -> "브론즈"
}

// 브론즈는 사진 액자가 바로 보이고, 실버·다이아는 닫힌 캡슐을 열어야 사진이 나온다
internal fun hasCapsuleBox(grade: String) = grade != BRONZE

// 등급별 3D 모델 파일 (app/src/main/assets/models). 실버는 기본 캡슐, 다이아는 전용 모델
internal fun bodyModelFile(grade: String) = if (grade == DIAMOND) "models/capsule_diamond_body.glb" else "models/capsule_body.glb"
internal fun lidModelFile(grade: String) = if (grade == DIAMOND) "models/capsule_diamond_lid.glb" else "models/capsule_lid.glb"

// 구글 클라우드 앵커 보관 기간(일). 키 없는 인증의 최대치가 365일이라 실버·다이아도 365일로 저장하고,
// 2년·평생은 만료 전에 기간을 연장해야 한다 (docs/10-native-PRD.md NQ-05)
internal fun anchorTtlDays(grade: String) = if (grade == BRONZE) 30 else 365

// 신고 사유: 서버 reports.reason 값과 화면에 보이는 이름
internal val REPORT_REASONS = listOf(
    "ABUSE" to "욕설·비방",
    "SEXUAL" to "음란·선정적인 사진",
    "VIOLENCE" to "폭력·혐오",
    "PRIVACY" to "개인정보·초상권 침해",
    "COPYRIGHT" to "저작권 침해",
    "OTHER" to "그 밖의 이유",
)

internal fun distance(a: Pose, b: Pose): Float {
    val dx = a.tx() - b.tx()
    val dy = a.ty() - b.ty()
    val dz = a.tz() - b.tz()
    return Math.sqrt((dx * dx + dy * dy + dz * dz).toDouble()).toFloat()
}

// 화면에 놓인 캡슐 하나. 바뀌는 값은 Compose 상태로 둔다
internal class Capsule(
    val id: String,
    val anchor: Anchor,
    val grade: String,
    bitmap: Bitmap,
    sizeM: Float,
    rotDeg: Float,
    val mine: Boolean = true, // 내가 놓은 캡슐인지 (주인만 삭제할 수 있다)
) {
    var serverId: String? = null // 서버에 저장된 캡슐이면 그 ID

    // 서버에 저장된 크기·방향. 지금 값과 다르면 "변경 저장"을 보여 준다
    var savedSizeM: Float = sizeM
    var savedRotDeg: Float = rotDeg
    var bitmap by mutableStateOf(bitmap)
    var sizeM by mutableFloatStateOf(sizeM) // 사진 긴 변 길이(m)
    var rotDeg by mutableFloatStateOf(rotDeg) // 세로축 회전(도)
    var dist by mutableFloatStateOf(99f)
    var mapX by mutableFloatStateOf(0f) // 미니맵: 내 오른쪽으로 몇 m
    var mapY by mutableFloatStateOf(0f) // 미니맵: 내 앞으로 몇 m
    var opened by mutableStateOf(false)
    var paid by mutableStateOf(false) // 한 번 결제해서 연 캡슐 (다시 열 때 결제를 묻지 않는다)

    val changed get() = serverId != null && (abs(sizeM - savedSizeM) > 0.005f || abs(rotDeg - savedRotDeg) > 0.5f)
    val closed get() = hasCapsuleBox(grade) && !opened
}
