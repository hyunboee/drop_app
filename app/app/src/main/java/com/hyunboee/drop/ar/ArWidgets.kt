package com.hyunboee.drop.ar

import android.view.SurfaceView
import android.view.TextureView
import android.view.View
import android.view.ViewGroup
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderColors
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size as UiSize
import androidx.compose.ui.graphics.Color as UiColor
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.hyunboee.drop.ui.Tokens

// AR 화면의 작은 부품들: 알약 버튼, 한 줄 슬라이더, 미니맵, 저장 진행 표시, 화면 확대용 View 찾기

internal val PanelShape = RoundedCornerShape(16.dp)

internal fun findTextureView(v: View): TextureView? = when (v) {
    is TextureView -> v
    is ViewGroup -> (0 until v.childCount).firstNotNullOfOrNull { findTextureView(v.getChildAt(it)) }
    else -> null
}

internal fun findSurfaceView(v: View): SurfaceView? = when (v) {
    is SurfaceView -> v
    is ViewGroup -> (0 until v.childCount).firstNotNullOfOrNull { findSurfaceView(v.getChildAt(it)) }
    else -> null
}

internal const val ZOOM_MIN = 1f
internal const val ZOOM_MAX = 5f

// 이름·값은 왼쪽에 작게, 슬라이더는 가는 한 줄로 둔다
@Composable
internal fun CompactSlider(label: String, value: Float, range: ClosedFloatingPointRange<Float>, colors: SliderColors, onChange: (Float) -> Unit) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(label, color = Tokens.HomeSub, fontSize = 11.sp, modifier = Modifier.width(84.dp))
        Slider(value = value, onValueChange = onChange, valueRange = range, colors = colors, modifier = Modifier.weight(1f).height(30.dp))
    }
}

internal enum class SaveKind { SAVING, DONE, FAILED }

internal class SaveStatus(val kind: SaveKind, val text: String)

// 저장 진행·완료·실패 안내 한 줄: 저장 중에는 주황 테두리와 돌아가는 표시, 성공은 초록 체크, 실패는 빨간 느낌표
@Composable
internal fun SaveBanner(st: SaveStatus) {
    val color = when (st.kind) {
        SaveKind.SAVING -> Tokens.Amber
        SaveKind.DONE -> UiColor(0xFF7BD88F)
        SaveKind.FAILED -> Tokens.Error
    }
    Row(
        Modifier
            .fillMaxWidth()
            .clip(PanelShape)
            .background(Tokens.Surface)
            .border(1.dp, color, PanelShape)
            .padding(horizontal = 16.dp, vertical = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        when (st.kind) {
            SaveKind.SAVING -> CircularProgressIndicator(Modifier.size(22.dp), color = Tokens.Amber, strokeWidth = 2.5.dp)
            SaveKind.DONE -> Text("✓", color = color, fontSize = 20.sp, fontWeight = FontWeight.Bold)
            SaveKind.FAILED -> Text("!", color = color, fontSize = 20.sp, fontWeight = FontWeight.Bold)
        }
        Text(st.text, color = Tokens.HomeText, fontSize = 14.sp, fontWeight = FontWeight.Medium)
    }
}

// ponytail: 실내 실험이라 미니맵 범위를 5m로 둔다. 실제 앱은 NP-06(30m)과 서버의 주변 캡슐로 바꾼다
private const val MINIMAP_RANGE_M = 5f

// 미니맵: 가운데가 나, 위쪽이 내가 보는 방향. 사진이 보이는 캡슐은 동그라미, 닫힌 상자는 네모
@Composable
internal fun MiniMap(capsules: List<Capsule>) {
    Canvas(Modifier.size(96.dp).clip(CircleShape).background(Tokens.Surface).border(1.dp, Tokens.CardLine, CircleShape)) {
        val r = size.minDimension / 2f
        val mark = 5.dp.toPx()
        drawCircle(Tokens.CardLine, radius = r / 2f, style = Stroke(1.dp.toPx()))
        for (c in capsules) {
            val x = c.mapX / MINIMAP_RANGE_M * r
            val y = -c.mapY / MINIMAP_RANGE_M * r
            if (kotlin.math.hypot(x, y) > r - mark) continue // 범위 밖
            val at = center + Offset(x, y)
            if (c.closed) {
                drawRect(Tokens.Silver, topLeft = at - Offset(mark, mark), size = UiSize(mark * 2, mark * 2))
            } else {
                drawCircle(Tokens.Amber, radius = mark, center = at)
            }
        }
        // 나: 가운데 흰 점과 보는 방향
        drawCircle(Tokens.HomeText, radius = 3.dp.toPx(), center = center)
        drawLine(Tokens.HomeText, center, center - Offset(0f, 9.dp.toPx()), strokeWidth = 1.5.dp.toPx())
    }
}

// 카메라 영상 위에 뜨는 알약 모양 버튼. primary는 앰버 채움(한 줄에 하나), danger는 되돌릴 수 없는 동작
@Composable
internal fun Pill(
    text: String,
    onClick: () -> Unit,
    primary: Boolean = false,
    danger: Boolean = false,
    small: Boolean = false,
    enabled: Boolean = true,
    textColor: UiColor = Tokens.HomeText,
) {
    Text(
        text,
        color = when {
            primary -> Tokens.TextOnGold
            danger -> Tokens.Error
            small -> Tokens.HomeSub
            else -> textColor
        },
        fontSize = if (small) 12.sp else 14.sp,
        fontWeight = if (primary) FontWeight.Bold else FontWeight.Medium,
        modifier = Modifier
            .alpha(if (enabled) 1f else 0.4f)
            .clip(RoundedCornerShape(50))
            .background(if (primary) Tokens.Amber else Tokens.Surface)
            .clickable(enabled = enabled, onClick = onClick)
            .padding(horizontal = if (small) 12.dp else 16.dp, vertical = if (small) 8.dp else 11.dp),
    )
}
