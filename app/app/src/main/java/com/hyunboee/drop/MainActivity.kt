package com.hyunboee.drop

// OPS-N04 실증용 버리는 코드 (docs/12-native-plan.md). 통과하면 지우고 APP-01부터 새로 만든다.
// 확인하는 것: 키 없는 인증으로 30일 보관 앵커 저장·인식, SceneView 사진 액자, 사진 선택기
// 추가 실험: 등급별 표시 — 브론즈는 사진 액자가 그대로 보이고, 상위 등급은 닫힌 캡슐을 열어야 보인다
//   (docs/13-capsule-dev-plan.md 3장의 대기 → 접근 → 개봉). 3D 모델 파일이 없어 상자 모양으로 대신한다.

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Paint
import android.media.AudioManager
import android.media.ExifInterface
import android.media.ToneGenerator
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.HapticFeedbackConstants
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color as UiColor
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.google.ar.core.Anchor
import com.google.ar.core.Config
import com.google.ar.core.Frame
import com.google.ar.core.Plane
import com.google.ar.core.Pose
import com.google.ar.core.Session
import com.google.ar.core.TrackingState
import io.github.sceneview.ar.ARSceneView
import io.github.sceneview.math.Direction
import io.github.sceneview.math.Position
import io.github.sceneview.math.Rotation
import io.github.sceneview.math.Scale
import io.github.sceneview.math.Size
import io.github.sceneview.rememberEngine
import io.github.sceneview.rememberMaterialLoader
import io.github.sceneview.rememberOnGestureListener
import kotlinx.coroutines.delay

private const val TAG = "DropSpike"
private const val TTL_DAYS = 30

// 실험용 "접근 연출이 시작되는 거리". 실제 앱은 서버가 GPS로 10m(PRM-01)를 판정한다. 실내에서 걸어 보며 확인하려고 짧게 잡았다
private const val NEAR_M = 1.5f

private const val BRONZE = "BRONZE"
private const val SILVER = "SILVER"

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // adb로 넘긴 앵커 ID: adb shell am start -n com.hyunboee.drop/.MainActivity --es anchorId <ID>
        val anchorId = intent.getStringExtra("anchorId")
        setContent { Spike(anchorId) }
    }
}

private fun placeholderBitmap(): Bitmap {
    val b = Bitmap.createBitmap(512, 512, Bitmap.Config.ARGB_8888)
    val c = Canvas(b)
    c.drawColor(Color.rgb(233, 211, 154))
    val p = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.rgb(43, 34, 19)
        textSize = 96f
        textAlign = Paint.Align.CENTER
    }
    c.drawText("DROP", 256f, 290f, p)
    return b
}

// 사진을 읽어 긴 변 1024px로 줄이고, 촬영 방향 정보(EXIF)대로 바로 세운다.
// 방향 정보를 무시하면 세로로 찍은 사진이 90도 누운 채로 나온다
private fun decodeUpright(context: Context, uri: Uri): Bitmap? {
    val orientation = context.contentResolver.openInputStream(uri)?.use {
        ExifInterface(it).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)
    } ?: ExifInterface.ORIENTATION_NORMAL
    val raw = context.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it) } ?: return null
    val m = Matrix()
    val scale = minOf(1f, 1024f / maxOf(raw.width, raw.height))
    m.postScale(scale, scale)
    when (orientation) {
        ExifInterface.ORIENTATION_ROTATE_90 -> m.postRotate(90f)
        ExifInterface.ORIENTATION_ROTATE_180 -> m.postRotate(180f)
        ExifInterface.ORIENTATION_ROTATE_270 -> m.postRotate(270f)
        ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> m.postScale(-1f, 1f)
        ExifInterface.ORIENTATION_FLIP_VERTICAL -> m.postScale(1f, -1f)
    }
    Log.i(TAG, "PHOTO exif=$orientation raw=${raw.width}x${raw.height}")
    return Bitmap.createBitmap(raw, 0, 0, raw.width, raw.height, m, true)
}

private fun distance(a: Pose, b: Pose): Float {
    val dx = a.tx() - b.tx()
    val dy = a.ty() - b.ty()
    val dz = a.tz() - b.tz()
    return Math.sqrt((dx * dx + dy * dy + dz * dz).toDouble()).toFloat()
}

// 화면에 놓인 캡슐 하나. 바뀌는 값은 Compose 상태로 둔다
private class Capsule(
    val id: String,
    val anchor: Anchor,
    val grade: String,
    bitmap: Bitmap,
    sizeM: Float,
    rotDeg: Float,
    val mine: Boolean = true, // 내가 놓은 캡슐인지 (주인만 삭제할 수 있다)
) {
    var bitmap by mutableStateOf(bitmap)
    var sizeM by mutableFloatStateOf(sizeM) // 사진 긴 변 길이(m)
    var rotDeg by mutableFloatStateOf(rotDeg) // 세로축 회전(도)
    var dist by mutableFloatStateOf(99f)
    var opened by mutableStateOf(false)
    var paid by mutableStateOf(false) // 한 번 결제해서 연 캡슐 (다시 열 때 결제를 묻지 않는다)
    val closed get() = grade != BRONZE && !opened
}

@Composable
private fun Spike(startAnchorId: String?) {
    val context = LocalContext.current
    val view = LocalView.current
    val main = remember { Handler(Looper.getMainLooper()) }
    val tone = remember { ToneGenerator(AudioManager.STREAM_MUSIC, 70) }
    val engine = rememberEngine()
    val materialLoader = rememberMaterialLoader(engine)

    var session by remember { mutableStateOf<Session?>(null) }
    val frameHolder = remember { arrayOfNulls<Frame>(1) } // 매 프레임 바뀌므로 Compose 상태로 두지 않는다
    var status by remember { mutableStateOf("평면을 찾는 중… 바닥이나 탁자를 비춰 주세요") }
    var quality by remember { mutableStateOf("-") }

    // 다음에 놓을 것의 설정
    var bitmap by remember { mutableStateOf(placeholderBitmap()) }
    var grade by remember { mutableStateOf(BRONZE) }
    var sizeM by remember { mutableFloatStateOf(0.4f) }
    var rotDeg by remember { mutableFloatStateOf(0f) }

    // 지금 놓고 있는 캡슐(다른 곳을 누르면 옮겨진다)과 [완료]로 확정한 캡슐들
    var current by remember { mutableStateOf<Capsule?>(null) }
    val done = remember { mutableStateListOf<Capsule>() }
    var seq by remember { mutableStateOf(0) }

    // 저장해 둔 캡슐 (앱을 다시 켰을 때 인식)
    val prefs = remember { context.getSharedPreferences("spike", Context.MODE_PRIVATE) }
    val savedFile = remember { java.io.File(context.filesDir, "anchor.jpg") }
    var hostedId by remember { mutableStateOf(startAnchorId ?: prefs.getString("anchorId", "") ?: "") }
    val startId = remember { hostedId }
    var resolved by remember { mutableStateOf<Capsule?>(null) }
    var resolveAsked by remember { mutableStateOf(false) }
    var lastTick by remember { mutableStateOf(0L) }
    // 결제 확인 창을 띄울 캡슐, 없으면 null
    var payFor by remember { mutableStateOf<Capsule?>(null) }
    // 삭제 확인 창을 띄울 캡슐, 없으면 null
    var deleteFor by remember { mutableStateOf<Capsule?>(null) }
    // 눌러서 고른 캡슐. 여러 개가 모여 있을 때 잘못 고르지 않도록, 먼저 고르고(파란색) 그다음 열기·닫기·삭제를 한다
    var selected by remember { mutableStateOf<Capsule?>(null) }

    val all = listOfNotNull(current) + done + listOfNotNull(resolved)

    fun log(msg: String) {
        Log.i(TAG, msg)
        status = msg
    }

    fun buzz() {
        view.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS)
    }

    val picker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        val picked = decodeUpright(context, uri)
        if (picked == null) {
            log("사진을 읽지 못했어요")
        } else {
            bitmap = picked
            current?.bitmap = picked
            log("사진 선택됨 ${picked.width}x${picked.height}")
        }
    }

    fun resolve(id: String) {
        val s = session ?: return log("세션이 아직 없어요")
        log("인식 중… $id")
        try {
            s.resolveCloudAnchorAsync(id) { anchor, state ->
                main.post {
                    if (state == Anchor.CloudAnchorState.SUCCESS && anchor != null) {
                        resolved?.anchor?.detach()
                        val saved = if (savedFile.exists()) BitmapFactory.decodeFile(savedFile.path) else null
                        seq += 1
                        resolved = Capsule(
                            "r$seq",
                            anchor,
                            prefs.getString("grade", BRONZE) ?: BRONZE,
                            saved ?: bitmap,
                            prefs.getFloat("sizeM", 0.4f),
                            prefs.getFloat("rotDeg", 0f),
                            // 실험: adb로 ID를 넘겨 실행하면 "남이 놓은 캡슐"로 본다. 앱이 기억해 둔 ID면 내 캡슐이다
                            mine = startAnchorId == null,
                        )
                        log("RESOLVE_OK $id")
                    } else {
                        anchor?.detach()
                        log("RESOLVE_FAIL $state")
                    }
                }
            }
        } catch (e: Exception) {
            log("RESOLVE_EXCEPTION ${e.javaClass.simpleName}: ${e.message}")
        }
    }

    // 지금 놓고 있는 캡슐(없으면 마지막으로 완료한 캡슐)을 클라우드 앵커로 저장한다
    fun host() {
        val s = session ?: return log("세션이 아직 없어요")
        val c = current ?: done.lastOrNull() ?: return log("먼저 평면을 눌러 캡슐을 놓아 주세요")
        log("저장 중… (보관 ${TTL_DAYS}일)")
        try {
            s.hostCloudAnchorAsync(c.anchor, TTL_DAYS) { id, state ->
                main.post {
                    if (state == Anchor.CloudAnchorState.SUCCESS && id != null) {
                        hostedId = id
                        prefs.edit()
                            .putString("anchorId", id)
                            .putString("grade", c.grade)
                            .putFloat("sizeM", c.sizeM)
                            .putFloat("rotDeg", c.rotDeg)
                            .apply()
                        savedFile.outputStream().use { c.bitmap.compress(Bitmap.CompressFormat.JPEG, 90, it) }
                        log("HOST_OK $id (${c.grade})")
                    } else {
                        log("HOST_FAIL $state")
                    }
                }
            }
        } catch (e: Exception) {
            log("HOST_EXCEPTION ${e.javaClass.simpleName}: ${e.message}")
        }
    }

    // 캡슐을 연다. 실제 앱은 여기서 결제(영수증 검증)와 서버 열람 판정을 거친다
    fun open(c: Capsule) {
        c.opened = true
        c.paid = true
        buzz()
        tone.startTone(ToneGenerator.TONE_PROP_ACK, 250)
        log("OPENED ${c.id} (실험: 실제 결제는 이루어지지 않았어요)")
    }

    // 화면에서 누른 자리에 있는 캡슐을 찾는다. 캡슐 위치를 화면 좌표로 옮겨 비교한다
    fun capsuleAt(x: Float, y: Float, only: (Capsule) -> Boolean): Capsule? {
        val cam = frameHolder[0]?.camera ?: return null
        val viewM = FloatArray(16)
        val projM = FloatArray(16)
        val vp = FloatArray(16)
        cam.getViewMatrix(viewM, 0)
        cam.getProjectionMatrix(projM, 0, 0.05f, 100f)
        android.opengl.Matrix.multiplyMM(vp, 0, projM, 0, viewM, 0)
        return all.firstOrNull { c ->
            if (!only(c)) return@firstOrNull false
            // 닫힌 상자는 상자 높이, 사진이 보이는 캡슐은 사진 가운데 높이를 기준으로 한다
            val photoH = c.sizeM * c.bitmap.height / maxOf(c.bitmap.width, c.bitmap.height)
            val h = if (c.closed) 0.08f else if (c.grade == BRONZE) photoH / 2f else 0.32f + photoH / 2f
            val reach = if (c.closed) 0.25f else maxOf(0.25f, c.sizeM * 0.6f)
            val w = floatArrayOf(c.anchor.pose.tx(), c.anchor.pose.ty() + h, c.anchor.pose.tz(), 1f)
            val q = FloatArray(4)
            android.opengl.Matrix.multiplyMV(q, 0, vp, 0, w, 0)
            if (q[3] <= 0f) return@firstOrNull false // 카메라 뒤
            val sx = (q[0] / q[3] * 0.5f + 0.5f) * view.width
            val sy = (1f - (q[1] / q[3] * 0.5f + 0.5f)) * view.height
            val radius = maxOf(110f, reach / maxOf(c.dist, 0.2f) * view.height)
            Math.hypot((x - sx).toDouble(), (y - sy).toDouble()) <= radius
        }
    }

    // 캡슐을 지운다. 실제 앱은 서버가 주인인지 다시 확인한다(FR-11)
    fun delete(c: Capsule) {
        c.anchor.detach()
        if (c === selected) selected = null
        when {
            c === current -> current = null
            c === resolved -> {
                resolved = null
                hostedId = ""
                prefs.edit().remove("anchorId").apply() // 다시 켜도 나타나지 않게 한다
            }
            else -> done.remove(c)
        }
        buzz()
        log("DELETED ${c.id}")
    }

    // 실행할 때 기억해 둔 ID가 있으면 세션이 준비된 뒤 한 번 인식한다
    LaunchedEffect(Unit) {
        if (startId.isBlank()) return@LaunchedEffect
        prefs.edit().putString("anchorId", startId).apply()
        while (session == null) delay(200)
        delay(3000)
        resolveAsked = true
        resolve(startId)
    }

    // 접근 연출: 닫힌 캡슐의 반경 안으로 들어오는 순간 한 번 진동·효과음
    val nearCapsules = all.filter { it.closed && it.dist <= NEAR_M }
    LaunchedEffect(nearCapsules.joinToString { it.id }) {
        if (nearCapsules.isNotEmpty()) {
            buzz()
            tone.startTone(ToneGenerator.TONE_PROP_BEEP2, 150)
            Log.i(TAG, "NEAR ${nearCapsules.joinToString { it.id }}")
        }
    }

    Box(Modifier.fillMaxSize()) {
        ARSceneView(
            modifier = Modifier.fillMaxSize(),
            engine = engine,
            materialLoader = materialLoader,
            planeRenderer = true,
            cloudAnchorMode = Config.CloudAnchorMode.ENABLED,
            onSessionCreated = {
                session = it
                Log.i(TAG, "SESSION_CREATED")
            },
            onSessionFailed = { e -> log("SESSION_FAILED ${e.javaClass.simpleName}: ${e.message}") },
            onSessionUpdated = { s, f ->
                frameHolder[0] = f
                val now = System.currentTimeMillis()
                if (now - lastTick > 250 && f.camera.trackingState == TrackingState.TRACKING) {
                    lastTick = now
                    val cam = f.camera.pose
                    all.forEach { it.dist = distance(cam, it.anchor.pose) }
                    if (current != null) {
                        quality = runCatching { s.estimateFeatureMapQualityForHosting(cam).name }.getOrElse { "-" }
                    }
                }
            },
            onGestureListener = rememberOnGestureListener(
                // 두 손가락 벌리기·오므리기: 지금 놓고 있는 사진의 크기를 바꾼다 (크기 슬라이더와 같은 값)
                onScale = { detector, _, _ ->
                    val next = (sizeM * detector.scaleFactor).coerceIn(0.1f, 2.0f)
                    sizeM = next
                    current?.sizeM = next
                },
                // 꾹 누르기: 그 자리의 캡슐을 지운다. 주인만 가능하다
                onLongPress = { e, _ ->
                    val capsule = capsuleAt(e.x, e.y) { true }
                    if (capsule == null) {
                        log("꾹 누른 자리에 캡슐이 없어요")
                    } else if (!capsule.mine) {
                        buzz()
                        selected = capsule
                        log("NOT_OWNER ${capsule.id} · 이 캡슐의 주인만 삭제할 수 있어요")
                    } else {
                        buzz()
                        selected = capsule
                        deleteFor = capsule
                    }
                },
                onSingleTapConfirmed = { e, _ ->
                    val capsule = capsuleAt(e.x, e.y) { true }
                    if (capsule != null) {
                        // 캡슐을 눌렀다: 고르기만 한다(다시 누르면 해제). 열기·닫기·삭제는 아래 버튼으로 한다
                        selected = if (selected === capsule) null else capsule
                        log(if (selected == null) "선택을 해제했어요" else "SELECTED ${capsule.id} · 아래 버튼으로 열기·닫기·삭제를 할 수 있어요")
                    } else {
                        val hit = frameHolder[0]?.hitTest(e.x, e.y)?.firstOrNull { h ->
                            val t = h.trackable
                            t is Plane && t.isPoseInPolygon(h.hitPose)
                        }
                        if (hit == null) {
                            log("평면이 아니에요. 표시된 평면 위를 눌러 주세요")
                        } else {
                            // 놓고 있는 캡슐이 있으면 그 캡슐을 옮기고, 없으면 새로 놓는다
                            val old = current
                            if (selected === old) selected = null
                            old?.anchor?.detach()
                            seq += 1
                            current = Capsule(
                                "c$seq",
                                hit.createAnchor(),
                                old?.grade ?: grade,
                                old?.bitmap ?: bitmap,
                                old?.sizeM ?: sizeM,
                                old?.rotDeg ?: rotDeg,
                            ).also { it.dist = hit.distance }
                            val what = if ((old?.grade ?: grade) == BRONZE) "브론즈(사진이 바로 보임)" else "실버(닫힌 캡슐)"
                            log(if (old == null) "PLACED $what · 자리를 정했으면 [완료]를 누르세요" else "MOVED $what")
                        }
                    }
                },
            ),
        ) {
            all.forEach { item ->
                // 캡슐마다 노드 묶음을 따로 만든다. 옮기면 ID가 바뀌어 통째로 새로 만들어진다
                key(item.id) {
                    val near = item.dist <= NEAR_M
                    // 사진의 가로·세로를 비율대로, 긴 변이 sizeM이 되게 한다
                    val bw = item.bitmap.width.toFloat()
                    val bh = item.bitmap.height.toFloat()
                    val baseW = bw / maxOf(bw, bh) // 긴 변을 1m로 둔 기본 크기
                    val baseH = bh / maxOf(bw, bh)
                    val ph = item.sizeM * baseH // 실제로 보이는 높이
                    AnchorNode(anchor = item.anchor) {
                        // 세로축 회전은 묶음 노드 하나로 전체에 적용한다
                        Node(rotation = Rotation(y = item.rotDeg)) {
                            if (item.grade == BRONZE) {
                                // 브론즈: 사진 액자가 그대로 보인다
                                key(item.bitmap) {
                                    ImageNode(
                                        bitmap = item.bitmap,
                                        size = Size(baseW, baseH),
                                        position = Position(y = ph / 2f),
                                        scale = Scale(item.sizeM),
                                    )
                                }
                                // 고른 사진 위에 파란 표시를 띄운다
                                TextNode(
                                    text = "선택됨",
                                    backgroundColor = 0xEE1E6BFF.toInt(),
                                    position = Position(y = ph + 0.12f),
                                    scale = Scale(if (item === selected) 1f else 0.0001f),
                                )
                            } else {
                                // 상위 등급: 대기(작고 어두움) → 접근(솟아오르고 밝아짐) → 개봉(뚜껑이 열리고 사진이 떠오름)
                                // 노드는 넣었다 빼지 않고 항상 둔 채 크기로 숨긴다. 재질도 노드마다 따로 만든다.
                                // (노드를 넣었다 빼거나 재질을 바꿔 끼우면 다시 열 때 상자와 사진이 안 보이는 문제가 있었다)
                                val rise by animateFloatAsState(if (near || item.opened || item === selected) 1f else 0f, tween(1200), label = "rise")
                                val open by animateFloatAsState(if (item.opened) 1f else 0f, tween(800), label = "open")
                                // 상자 색: 고른 것은 파란색, 이미 결제한 것은 회색, 가까이 가면 금색, 그 밖은 어두운 갈색.
                                // 재질을 바꿔 끼우지 않으려고 색마다 상자를 따로 두고 하나만 보이게 한다
                                val colors = listOf(UiColor(0xFF6B5A3A), UiColor(0xFFE9D39A), UiColor(0xFF1E6BFF), UiColor(0xFF9A9A9A))
                                val bodyMats = remember { colors.map { materialLoader.createColorInstance(it, metallic = 0.3f, roughness = 0.5f) } }
                                val lidMats = remember { colors.map { materialLoader.createColorInstance(it, metallic = 0.3f, roughness = 0.5f) } }
                                val glowMats = remember { List(9) { materialLoader.createUnlitColorInstance(UiColor(0xFFFFF4C2)) } }
                                val hidden = 0.0001f
                                val shown = when {
                                    item === selected -> 2 // 파란색
                                    item.paid -> 3 // 회색
                                    near || item.opened -> 1 // 금색
                                    else -> 0
                                }
                                val bodyY = -0.06f + 0.14f * rise // 대기 때는 반쯤 묻힌 높이
                                val lidPos = Position(y = bodyY + 0.10f + 0.16f * open, z = -0.16f * open)
                                val lidRot = Rotation(x = -70f * open) // 열리면 위로 들리며 뒤로 젖혀진다
                                for (i in colors.indices) {
                                    val sc = Scale(if (i == shown) 1f else hidden)
                                    CubeNode(size = Size(0.26f, 0.16f, 0.26f), materialInstance = bodyMats[i], position = Position(y = bodyY), scale = sc)
                                    CubeNode(size = Size(0.28f, 0.04f, 0.28f), materialInstance = lidMats[i], position = lidPos, rotation = lidRot, scale = sc)
                                }

                                // 열리는 동안 빛: 밝은 구가 상자에서 부풀었다 사라지고, 작은 빛 알갱이가 퍼진다
                                val bursting = open > 0.01f && open < 0.99f
                                val fade = 1f - open
                                SphereNode(
                                    radius = 0.13f,
                                    materialInstance = glowMats[8],
                                    position = Position(y = bodyY + 0.10f),
                                    scale = Scale(if (bursting) (0.6f + 2.2f * open) * fade else hidden),
                                )
                                for (i in 0 until 8) {
                                    val ang = Math.toRadians(i * 45.0)
                                    SphereNode(
                                        radius = 0.02f,
                                        materialInstance = glowMats[i],
                                        position = Position(
                                            x = (Math.cos(ang) * 0.35 * open).toFloat(),
                                            y = bodyY + 0.12f + 0.45f * open,
                                            z = (Math.sin(ang) * 0.35 * open).toFloat(),
                                        ),
                                        scale = Scale(if (bursting) fade else hidden),
                                    )
                                }
                                key(item.bitmap) {
                                    ImageNode(
                                        bitmap = item.bitmap,
                                        size = Size(baseW, baseH),
                                        position = Position(y = bodyY + 0.14f + (0.10f + ph / 2f) * open),
                                        scale = Scale(maxOf(open * item.sizeM, hidden)),
                                    )
                                }
                                TextNode(
                                    text = when {
                                        item === selected -> "선택됨"
                                        item.paid -> "결제 완료"
                                        else -> "실버 캡슐 · ${"%.1f".format(item.dist)}m"
                                    },
                                    position = Position(y = bodyY + 0.32f),
                                    scale = Scale(if (open > 0.05f) hidden else 1f),
                                )
                            }
                        }
                    }
                }
            }
        }

        payFor?.let { c ->
            AlertDialog(
                onDismissRequest = { payFor = null },
                title = { Text("실버 상자입니다") },
                text = { Text("유료 결제 1달러 진행하시겠습니까?") },
                confirmButton = {
                    TextButton(onClick = {
                        payFor = null
                        open(c)
                    }) { Text("결제하고 열기") }
                },
                dismissButton = { TextButton(onClick = { payFor = null }) { Text("취소") } },
            )
        }

        deleteFor?.let { c ->
            AlertDialog(
                onDismissRequest = { deleteFor = null },
                title = { Text("캡슐을 삭제할까요?") },
                text = { Text("삭제하면 되돌릴 수 없어요") },
                confirmButton = {
                    TextButton(onClick = {
                        deleteFor = null
                        delete(c)
                    }) { Text("삭제") }
                },
                dismissButton = { TextButton(onClick = { deleteFor = null }) { Text("취소") } },
            )
        }

        Column(
            Modifier
                .align(Alignment.TopCenter)
                .fillMaxWidth()
                .background(UiColor(0xAA000000))
                // 상태 표시줄·카메라 구멍과 겹치지 않게 안쪽으로 넣는다
                .statusBarsPadding()
                .padding(horizontal = 16.dp, vertical = 12.dp),
        ) {
            Text(status, color = UiColor.White, fontSize = 16.sp)
            Text(
                "놓은 캡슐 ${done.size}개" + (if (current != null) " + 놓는 중 1개" else "") + " · 스캔 품질: $quality",
                color = UiColor.White,
                fontSize = 12.sp,
            )
            if (resolveAsked) {
                val r = resolved
                Text(
                    if (r == null) {
                        "저장한 캡슐: 찾는 중… 저장했던 자리를 비춰 주세요"
                    } else {
                        "저장한 캡슐(${if (r.grade == BRONZE) "브론즈" else "실버"}): ${"%.1f".format(r.dist)}m"
                    },
                    color = UiColor(0xFF9BE39B),
                    fontSize = 14.sp,
                )
            }
        }

        Column(
            Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                // 하단 내비게이션 막대와 겹치지 않게 안쪽으로 넣는다
                .navigationBarsPadding()
                .padding(horizontal = 16.dp, vertical = 16.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            // 고른 캡슐에 할 수 있는 동작
            selected?.let { c ->
                Row(
                    Modifier.fillMaxWidth().background(UiColor(0xCC1E6BFF)).padding(horizontal = 8.dp, vertical = 4.dp),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    if (c.grade != BRONZE && !c.opened) {
                        // 이미 결제한 캡슐은 다시 묻지 않고 연다
                        Button(onClick = { if (c.paid) open(c) else payFor = c }) { Text("열기") }
                    }
                    if (c.grade != BRONZE && c.opened) {
                        Button(onClick = {
                            c.opened = false
                            log("CLOSED ${c.id}")
                        }) { Text("닫기") }
                    }
                    Button(onClick = {
                        if (c.mine) deleteFor = c else log("NOT_OWNER ${c.id} · 이 캡슐의 주인만 삭제할 수 있어요")
                    }) { Text("삭제") }
                    Button(onClick = { selected = null }) { Text("선택 해제") }
                }
            }
            // 크기·회전은 지금 놓고 있는 캡슐에 바로 적용되고, 다음에 놓을 것의 기본값이 된다
            Column(Modifier.fillMaxWidth().background(UiColor(0xAA000000)).padding(horizontal = 12.dp, vertical = 4.dp)) {
                Text("크기 ${"%.2f".format(sizeM)}m", color = UiColor.White, fontSize = 12.sp)
                Slider(
                    value = sizeM,
                    onValueChange = {
                        sizeM = it
                        current?.sizeM = it
                    },
                    valueRange = 0.1f..2.0f,
                )
                Text("회전 ${rotDeg.toInt()}°", color = UiColor.White, fontSize = 12.sp)
                Slider(
                    value = rotDeg,
                    onValueChange = {
                        rotDeg = it
                        current?.rotDeg = it
                    },
                    valueRange = 0f..359f,
                )
            }
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Button(onClick = { grade = if (grade == BRONZE) SILVER else BRONZE }) {
                    Text(if (grade == BRONZE) "등급: 브론즈" else "등급: 실버")
                }
                Button(onClick = {
                    picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
                }) { Text("사진") }
                Button(onClick = {
                    val c = current
                    if (c == null) {
                        log("놓고 있는 캡슐이 없어요. 평면을 눌러 놓아 주세요")
                    } else {
                        done.add(c)
                        current = null
                        log("DONE ${c.id} · 다른 곳을 누르면 새 캡슐을 놓아요 (지금 ${done.size}개)")
                    }
                }) { Text("완료") }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Button(onClick = { host() }) { Text("저장") }
                Button(onClick = { if (hostedId.isBlank()) log("인식할 ID가 없어요") else resolve(hostedId) }) { Text("인식") }
                Button(onClick = {
                    all.forEach { it.opened = false }
                    log("캡슐을 다시 닫았어요")
                }) { Text("다시 닫기") }
            }
        }
    }
}
