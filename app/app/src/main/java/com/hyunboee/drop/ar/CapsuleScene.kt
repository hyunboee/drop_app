package com.hyunboee.drop.ar

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.Color as UiColor
import io.github.sceneview.NodeScope
import io.github.sceneview.ar.ARSceneScope
import io.github.sceneview.loaders.MaterialLoader
import io.github.sceneview.loaders.ModelLoader
import io.github.sceneview.math.Position
import io.github.sceneview.math.Rotation
import io.github.sceneview.math.Scale
import io.github.sceneview.math.Size
import io.github.sceneview.rememberModelInstance
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin

// AR 장면(3D)에 그리는 것들. 노드는 넣었다 빼지 않고 항상 두고, 크기로 숨긴다.
// 재질은 노드마다 따로 만든다. (노드를 넣었다 빼거나 재질을 바꿔 끼우면 다시 열 때 상자와 사진이 안 보이는 문제가 있었다)

private const val HIDDEN = 0.0001f

// 실험용 "접근 연출이 시작되는 거리". 실제 앱은 서버가 GPS로 10m(PRM-01)를 판정한다. 실내에서 걸어 보며 확인하려고 짧게 잡았다
internal const val NEAR_M = 1.5f

// 길 안내 화살표: 반투명 파란 갈매기 무늬 세 개가 목표 쪽으로 흘러간다
@Composable
internal fun ARSceneScope.NavArrow(materialLoader: MaterialLoader, position: Position, yaw: Float, shown: Boolean) {
    val mats = remember { List(6) { materialLoader.createUnlitColorInstance(UiColor(0x8C2EA8FF)) } }
    val flow by rememberInfiniteTransition(label = "nav").animateFloat(0f, 1f, infiniteRepeatable(tween(900, easing = LinearEasing)), label = "flow")
    Node(position = position, rotation = Rotation(y = yaw), scale = Scale(if (shown) 1f else HIDDEN)) {
        for (i in 0 until 3) {
            val z = 0.45f - (i + flow) * 0.35f // 앞(-z)으로 흐른다
            // 양 끝에서 작아졌다 커져 끊김 없이 이어져 보인다
            val grow = Scale(sin(PI * (i + flow) / 3.0).toFloat().coerceAtLeast(0.05f))
            CubeNode(size = Size(0.34f, 0.02f, 0.08f), materialInstance = mats[i * 2], position = Position(x = -0.11f, z = z + 0.11f), rotation = Rotation(y = 45f), scale = grow)
            CubeNode(size = Size(0.34f, 0.02f, 0.08f), materialInstance = mats[i * 2 + 1], position = Position(x = 0.11f, z = z + 0.11f), rotation = Rotation(y = -45f), scale = grow)
        }
    }
}

// 캡슐 하나. 앵커에 붙여 제자리에 두고, 세로축 회전은 묶음 노드 하나로 전체에 적용한다
// selected: 눌러서 고른 캡슐, placing: 놓는 중([완료] 전)인 캡슐
@Composable
internal fun ARSceneScope.CapsuleNode(
    item: Capsule,
    selected: Boolean,
    placing: Boolean,
    materialLoader: MaterialLoader,
    modelLoader: ModelLoader,
    sfx: Sfx,
) {
    // 사진의 가로·세로를 비율대로, 긴 변이 sizeM이 되게 한다
    val bw = item.bitmap.width.toFloat()
    val bh = item.bitmap.height.toFloat()
    val baseW = bw / maxOf(bw, bh) // 긴 변을 1m로 둔 기본 크기
    val baseH = bh / maxOf(bw, bh)
    val photoH = item.sizeM * baseH // 실제로 보이는 높이
    // 놓는 중 노란 테두리: 사진 뒤에 조금 더 큰 노란 판을 대고, 상자 밑에는 노란 받침을 깐다. [완료]를 누르면 사라진다
    val edgeMats = remember { List(2) { materialLoader.createUnlitColorInstance(UiColor(0xFFFFD21E)) } }
    AnchorNode(anchor = item.anchor) {
        Node(rotation = Rotation(y = item.rotDeg)) {
            if (hasCapsuleBox(item.grade)) {
                CapsuleBox(item, selected, placing, baseW, baseH, photoH, edgeMats, materialLoader, modelLoader, sfx)
            } else {
                BronzeFrame(item, selected, placing, baseW, baseH, photoH, edgeMats[0])
            }
        }
    }
}

// 브론즈: 사진 액자가 그대로 보인다
@Composable
private fun NodeScope.BronzeFrame(item: Capsule, selected: Boolean, placing: Boolean, baseW: Float, baseH: Float, photoH: Float, edgeMat: com.google.android.filament.MaterialInstance) {
    val edge = 0.03f // 테두리 폭(m)
    CubeNode(
        size = Size(1f, 1f, 0.004f),
        materialInstance = edgeMat,
        position = Position(y = photoH / 2f, z = -0.004f),
        scale = if (placing) Scale(item.sizeM * baseW + edge, photoH + edge, 1f) else Scale(HIDDEN),
    )
    key(item.bitmap) {
        ImageNode(
            bitmap = item.bitmap,
            size = Size(baseW, baseH),
            position = Position(y = photoH / 2f),
            scale = Scale(item.sizeM),
        )
    }
    // 고른 사진 위에 파란 표시를 띄운다
    TextNode(
        text = "선택됨",
        backgroundColor = 0xEE1E6BFF.toInt(),
        position = Position(y = photoH + 0.12f),
        scale = Scale(if (selected) 1f else HIDDEN),
    )
}

// 실버·다이아: 대기(반쯤 묻힘) → 접근(솟아오름) → 개봉(뚜껑이 열리고 사진이 떠오름)
@Composable
private fun NodeScope.CapsuleBox(
    item: Capsule,
    selected: Boolean,
    placing: Boolean,
    baseW: Float,
    baseH: Float,
    photoH: Float,
    edgeMats: List<com.google.android.filament.MaterialInstance>,
    materialLoader: MaterialLoader,
    modelLoader: ModelLoader,
    sfx: Sfx,
) {
    val edge = 0.03f
    val near = item.dist <= NEAR_M
    val risen = near || item.opened || selected
    // 솟아오름·내려감·열림 소리: 상태가 바뀐 순간에만 낸다 (처음 그려질 때는 내지 않는다)
    var before by remember { mutableStateOf(risen to item.opened) }
    LaunchedEffect(risen, item.opened) {
        val (wasRisen, wasOpened) = before
        before = risen to item.opened
        when {
            item.opened && !wasOpened -> sfx.play(SfxKind.OPEN)
            risen && !wasRisen -> sfx.play(SfxKind.RISE)
            !risen && wasRisen -> sfx.play(SfxKind.LOWER)
        }
    }
    val rise by animateFloatAsState(if (risen) 1f else 0f, tween(1200), label = "rise")
    val open by animateFloatAsState(if (item.opened) 1f else 0f, tween(800), label = "open")

    // 캡슐 모델(몸통·뚜껑). 상태 색은 아래 받침 원판의 색으로 알린다.
    // 상태 색: 고른 것은 파란색, 이미 결제한 것은 회색, 가까이 가면 금색, 그 밖은 어두운 갈색.
    // (재질을 바꿔 끼우지 않으려고 색마다 원판을 따로 두고 하나만 보이게 한다)
    val bodyModel = rememberModelInstance(modelLoader, bodyModelFile(item.grade))
    val lidModel = rememberModelInstance(modelLoader, lidModelFile(item.grade))
    // 다이아는 보석 면이 몸통 파일에서 검게 나와 따로 둔 파일을 몸통 위치에 겹쳐 놓는다
    val shellModel = if (item.grade == DIAMOND) rememberModelInstance(modelLoader, "models/capsule_diamond_shell.glb") else null
    val stateColors = listOf(UiColor(0xFF6B5A3A), UiColor(0xFFE9D39A), UiColor(0xFF1E6BFF), UiColor(0xFF9A9A9A))
    val stateMats = remember { stateColors.map { materialLoader.createUnlitColorInstance(it) } }
    val glowMats = remember { List(9) { materialLoader.createUnlitColorInstance(UiColor(0xFFFFF4C2)) } }
    val shown = when {
        selected -> 2 // 파란색
        item.paid -> 3 // 회색
        near || item.opened -> 1 // 금색
        else -> 0
    }
    // 모델 원점은 몸통 바닥, 높이 0.323m(뚜껑 별도 0.077m, 전체 약 0.4m). 대기 때는 반쯤 묻혀 있다가 솟아오른다
    val baseY = -0.20f + 0.20f * rise
    val bodyY = baseY + 0.223f // 뚜껑 자리(몸통 윗면 = bodyY + 0.10) 기준
    for (i in stateColors.indices) {
        CylinderNode(
            radius = 0.17f,
            height = 0.004f,
            materialInstance = stateMats[i],
            position = Position(y = 0.002f),
            scale = Scale(if (i == shown) 1f else HIDDEN),
        )
    }
    bodyModel?.let { ModelNode(modelInstance = it, position = Position(y = baseY)) }
    shellModel?.let { ModelNode(modelInstance = it, position = Position(y = baseY)) }
    // 열리면 뚜껑이 위로 들리며 뒤로 젖혀진다
    lidModel?.let {
        ModelNode(modelInstance = it, position = Position(y = baseY + 0.323f + 0.18f * open, z = -0.10f * open), rotation = Rotation(x = -60f * open))
    }
    // 놓는 중([완료] 전) 노란 받침 (열어서 사진이 나오면 사진 뒤 노란 판으로 바뀐다)
    CubeNode(
        size = Size(0.36f, 0.006f, 0.36f),
        materialInstance = edgeMats[0],
        position = Position(y = 0.004f),
        scale = Scale(if (placing && open < 0.5f) 1f else HIDDEN),
    )
    CubeNode(
        size = Size(1f, 1f, 0.004f),
        materialInstance = edgeMats[1],
        position = Position(y = bodyY + 0.14f + (0.10f + photoH / 2f) * open, z = -0.004f),
        scale = if (placing && open >= 0.5f) Scale((item.sizeM * baseW + edge) * open, (photoH + edge) * open, 1f) else Scale(HIDDEN),
    )

    // 열리는 동안 빛: 밝은 구가 상자에서 부풀었다 사라지고, 작은 빛 알갱이가 퍼진다
    val bursting = open > 0.01f && open < 0.99f
    val fade = 1f - open
    SphereNode(
        radius = 0.13f,
        materialInstance = glowMats[8],
        position = Position(y = bodyY + 0.10f),
        scale = Scale(if (bursting) (0.6f + 2.2f * open) * fade else HIDDEN),
    )
    for (i in 0 until 8) {
        val ang = Math.toRadians(i * 45.0)
        SphereNode(
            radius = 0.02f,
            materialInstance = glowMats[i],
            position = Position(
                x = (cos(ang) * 0.35 * open).toFloat(),
                y = bodyY + 0.12f + 0.45f * open,
                z = (sin(ang) * 0.35 * open).toFloat(),
            ),
            scale = Scale(if (bursting) fade else HIDDEN),
        )
    }
    key(item.bitmap) {
        ImageNode(
            bitmap = item.bitmap,
            size = Size(baseW, baseH),
            position = Position(y = bodyY + 0.14f + (0.10f + photoH / 2f) * open),
            scale = Scale(maxOf(open * item.sizeM, HIDDEN)),
        )
    }
    TextNode(
        text = when {
            selected -> "선택됨"
            item.paid -> "결제 완료"
            else -> "${gradeLabel(item.grade)} 캡슐 · ${"%.1f".format(item.dist)}m"
        },
        position = Position(y = bodyY + 0.32f),
        scale = Scale(if (open > 0.05f) HIDDEN else 1f),
    )
}
