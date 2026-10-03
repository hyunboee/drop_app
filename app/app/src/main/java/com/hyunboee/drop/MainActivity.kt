package com.hyunboee.drop

// OPS-N04 실증용 버리는 코드 (docs/12-native-plan.md). 통과하면 지우고 APP-01부터 새로 만든다.
// 확인하는 것: 키 없는 인증으로 30일 보관 앵커 저장·인식, SceneView 사진 액자, 사진 선택기, VPS 가용 여부

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color as UiColor
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.google.ar.core.Anchor
import com.google.ar.core.Config
import com.google.ar.core.Frame
import com.google.ar.core.Plane
import com.google.ar.core.Session
import com.google.ar.core.TrackingState
import io.github.sceneview.ar.ARSceneView
import io.github.sceneview.math.Position
import io.github.sceneview.math.Size
import io.github.sceneview.rememberOnGestureListener
import kotlinx.coroutines.delay

private const val TAG = "DropSpike"
private const val TTL_DAYS = 30

// 실내 테스트 장소 근처 좌표 (VPS 가용 여부 확인용)
private const val VPS_LAT = 37.47900
private const val VPS_LNG = 126.81085

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

@Composable
private fun Spike(startAnchorId: String?) {
    val context = LocalContext.current
    val main = remember { Handler(Looper.getMainLooper()) }
    var session by remember { mutableStateOf<Session?>(null) }
    var frame by remember { mutableStateOf<Frame?>(null) }
    var bitmap by remember { mutableStateOf(placeholderBitmap()) }
    var localAnchor by remember { mutableStateOf<Anchor?>(null) }
    var resolvedAnchor by remember { mutableStateOf<Anchor?>(null) }
    var status by remember { mutableStateOf("평면을 찾는 중… 바닥이나 벽을 비춰 주세요") }
    var quality by remember { mutableStateOf("-") }
    // 마지막 앵커 ID를 기억해 앱을 다시 켜도 인식할 수 있게 한다
    val prefs = remember { context.getSharedPreferences("spike", android.content.Context.MODE_PRIVATE) }
    var hostedId by remember { mutableStateOf(startAnchorId ?: prefs.getString("anchorId", "") ?: "") }
    val startId = remember { hostedId }
    var stress by remember { mutableIntStateOf(0) } // 남은 반복 횟수
    var stressOn by remember { mutableStateOf(false) }
    var resolveAsked by remember { mutableStateOf(false) }

    fun log(msg: String) {
        Log.i(TAG, msg)
        status = msg
    }

    val picker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        val picked = context.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it) }
        if (picked == null) {
            log("사진을 읽지 못했어요")
        } else {
            val scale = 1024f / maxOf(picked.width, picked.height)
            bitmap = if (scale < 1f) {
                Bitmap.createScaledBitmap(picked, (picked.width * scale).toInt(), (picked.height * scale).toInt(), true)
            } else {
                picked
            }
            log("사진 선택됨 ${bitmap.width}x${bitmap.height}")
        }
    }

    fun resolve(id: String) {
        val s = session ?: return log("세션이 아직 없어요")
        log("인식 중… $id")
        try {
            s.resolveCloudAnchorAsync(id) { anchor, state ->
                main.post {
                    if (state == Anchor.CloudAnchorState.SUCCESS && anchor != null) {
                        resolvedAnchor?.detach()
                        resolvedAnchor = anchor
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

    fun host() {
        val s = session ?: return log("세션이 아직 없어요")
        val a = localAnchor ?: return log("먼저 평면을 눌러 액자를 놓아 주세요")
        log("저장 중… (보관 ${TTL_DAYS}일)")
        try {
            s.hostCloudAnchorAsync(a, TTL_DAYS) { id, state ->
                main.post {
                    if (state == Anchor.CloudAnchorState.SUCCESS && id != null) {
                        hostedId = id
                        prefs.edit().putString("anchorId", id).apply()
                        log("HOST_OK $id")
                    } else {
                        log("HOST_FAIL $state")
                    }
                }
            }
        } catch (e: Exception) {
            log("HOST_EXCEPTION ${e.javaClass.simpleName}: ${e.message}")
        }
    }

    fun checkVps() {
        val s = session ?: return log("세션이 아직 없어요")
        try {
            s.checkVpsAvailabilityAsync(VPS_LAT, VPS_LNG) { availability ->
                main.post { log("VPS $availability ($VPS_LAT, $VPS_LNG)") }
            }
        } catch (e: Exception) {
            log("VPS_EXCEPTION ${e.javaClass.simpleName}: ${e.message}")
        }
    }

    // 액자 20개를 만들었다 지우기를 반복한다 (RISK-N03)
    LaunchedEffect(stress) {
        if (stress <= 0) return@LaunchedEffect
        stressOn = !stressOn
        delay(400)
        stress -= 1
        if (stress == 0) {
            stressOn = false
            log("STRESS_DONE")
        }
    }

    // 실행할 때 넘겨받은 ID가 있으면 세션이 준비된 뒤 한 번 인식한다
    LaunchedEffect(Unit) {
        if (startId.isBlank()) return@LaunchedEffect
        prefs.edit().putString("anchorId", startId).apply()
        while (session == null) delay(200)
        delay(3000)
        resolveAsked = true
        resolve(startId)
    }

    Box(Modifier.fillMaxSize()) {
        ARSceneView(
            modifier = Modifier.fillMaxSize(),
            planeRenderer = true,
            cloudAnchorMode = Config.CloudAnchorMode.ENABLED,
            onSessionCreated = {
                session = it
                Log.i(TAG, "SESSION_CREATED")
            },
            onSessionFailed = { e -> log("SESSION_FAILED ${e.javaClass.simpleName}: ${e.message}") },
            onSessionUpdated = { s, f ->
                frame = f
                if (localAnchor != null && f.camera.trackingState == TrackingState.TRACKING) {
                    quality = runCatching { s.estimateFeatureMapQualityForHosting(f.camera.pose).name }.getOrDefault("-")
                }
            },
            onGestureListener = rememberOnGestureListener(
                onSingleTapConfirmed = { e, _ ->
                    val hit = frame?.hitTest(e.x, e.y)?.firstOrNull { h ->
                        val t = h.trackable
                        t is Plane && t.isPoseInPolygon(h.hitPose)
                    }
                    if (hit == null) {
                        log("평면이 아니에요. 표시된 평면 위를 눌러 주세요")
                    } else {
                        val type = (hit.trackable as Plane).type
                        localAnchor?.detach()
                        localAnchor = hit.createAnchor()
                        log("PLACED $type")
                    }
                },
            ),
        ) {
            localAnchor?.let { a ->
                AnchorNode(anchor = a) {
                    ImageNode(bitmap = bitmap, size = Size(0.4f, 0.4f), position = Position(y = 0.2f))
                    if (stressOn) {
                        for (i in 0 until 20) {
                            ImageNode(
                                bitmap = bitmap,
                                size = Size(0.15f, 0.15f),
                                position = Position(x = -0.8f + (i % 10) * 0.18f, y = 0.6f + (i / 10) * 0.2f),
                            )
                        }
                    }
                }
            }
            resolvedAnchor?.let { a ->
                AnchorNode(anchor = a) {
                    ImageNode(bitmap = bitmap, size = Size(0.4f, 0.4f), position = Position(y = 0.2f))
                }
            }
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
            Text("스캔 품질: $quality", color = UiColor.White, fontSize = 12.sp)
            if (hostedId.isNotBlank()) {
                SelectionContainer { Text("ID: $hostedId", color = UiColor(0xFFE9D39A), fontSize = 12.sp) }
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
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Button(onClick = {
                    picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
                }) { Text("사진") }
                Button(onClick = { host() }) { Text("저장") }
                Button(onClick = { if (hostedId.isBlank()) log("인식할 ID가 없어요") else resolve(hostedId) }) { Text("인식") }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Button(onClick = { if (localAnchor == null) log("먼저 액자를 놓아 주세요") else stress = 20 }) { Text("20개 반복") }
                Button(onClick = { checkVps() }) { Text("VPS") }
            }
        }
    }
}
