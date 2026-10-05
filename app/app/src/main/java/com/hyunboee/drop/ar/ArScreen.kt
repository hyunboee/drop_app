package com.hyunboee.drop.ar

// AR 화면: 캡슐 놓기·저장, 서버 캡슐을 제자리에 불러오기, 열기·닫기·삭제·크기 조절, 길 안내, 촬영.
// 이 파일은 화면의 상태와 흐름만 둔다. 다른 것은 같은 폴더의 파일로 나눴다:
//   Capsule.kt(캡슐·등급) ArMedia.kt(사진) AnchorOps.kt(구글 앵커 저장·찾기 정책)
//   CapsuleScene.kt(3D 장면) ArWidgets.kt(버튼·미니맵 등) NavGuide.kt(길 안내) Sfx.kt(효과음)

import android.Manifest
import android.graphics.Bitmap
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.HapticFeedbackConstants
import android.view.PixelCopy
import android.view.SurfaceView
import android.view.TextureView
import android.view.View
import android.view.ViewGroup
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.BackHandler
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextField
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color as UiColor
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.hyunboee.drop.M_11_TITLE_MAX_LENGTH
import com.hyunboee.drop.NP_02_RESOLVE_RANGE_M
import com.hyunboee.drop.NP_07_MAX_RESOLVING
import com.hyunboee.drop.NP_12_NEARBY_REFRESH_MS
import com.hyunboee.drop.NP_13_NAV_ANCHOR_ARRIVE_M
import com.hyunboee.drop.lib.distanceM
import com.hyunboee.drop.api.ApiClient
import com.hyunboee.drop.api.ApiException
import com.hyunboee.drop.api.publishCapsule
import com.hyunboee.drop.lib.hasLocationPermission
import com.hyunboee.drop.lib.rememberLocation
import com.hyunboee.drop.ui.MapPin
import kotlinx.coroutines.launch
import org.json.JSONObject
import kotlin.coroutines.resume
import kotlin.coroutines.suspendCoroutine
import com.hyunboee.drop.ui.Tokens
import com.google.ar.core.Anchor
import com.google.ar.core.Config
import com.google.ar.core.Frame
import com.google.ar.core.Plane
import com.google.ar.core.Session
import com.google.ar.core.TrackingState
import io.github.sceneview.SurfaceType
import io.github.sceneview.ar.ARSceneView
import io.github.sceneview.math.Position
import io.github.sceneview.rememberEngine
import io.github.sceneview.rememberMaterialLoader
import io.github.sceneview.rememberModelInstance
import io.github.sceneview.rememberModelLoader
import io.github.sceneview.rememberOnGestureListener
import kotlinx.coroutines.delay


@Composable
fun ArScreen(api: ApiClient, navTarget: MapPin?, onHome: () -> Unit, onMap: () -> Unit) {
    val context = LocalContext.current
    val view = LocalView.current
    val main = remember { Handler(Looper.getMainLooper()) }
    val sfx = remember { Sfx() }
    DisposableEffect(Unit) { onDispose { sfx.release() } }
    val engine = rememberEngine()
    val materialLoader = rememberMaterialLoader(engine)
    val modelLoader = rememberModelLoader(engine)

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
    // 서버에서 받아 구글 앵커로 제자리에 띄운 캡슐. loadedIds는 이미 불러왔거나 지금 자리를 찾는 중인 서버 캡슐 ID
    val remote = remember { mutableStateListOf<Capsule>() }
    val loadedIds = remember { mutableStateListOf<String>() }
    var lastTick by remember { mutableStateOf(0L) }
    // 결제 확인 창을 띄울 캡슐, 없으면 null
    var payFor by remember { mutableStateOf<Capsule?>(null) }
    // 삭제 확인 창을 띄울 캡슐, 없으면 null
    var deleteFor by remember { mutableStateOf<Capsule?>(null) }
    // 신고 사유를 고르는 창, 차단 확인 창을 띄울 캡슐 (다른 사람의 캡슐만)
    var reportFor by remember { mutableStateOf<Capsule?>(null) }
    var blockFor by remember { mutableStateOf<Capsule?>(null) }
    // 눌러서 고른 캡슐. 여러 개가 모여 있을 때 잘못 고르지 않도록, 먼저 고르고(파란색) 그다음 열기·닫기·삭제를 한다
    var selected by remember { mutableStateOf<Capsule?>(null) }

    val all = listOfNotNull(current) + done + remote
    // 크기·회전 조작의 대상: 고른 캡슐이 있으면 그 캡슐, 없으면 지금 놓고 있는 캡슐
    val target = selected ?: current
    var panelOpen by remember { mutableStateOf(false) } // 크기·회전 슬라이더는 접은 채로 시작
    LaunchedEffect(target) { panelOpen = false }
    var guiding by remember { mutableStateOf(navTarget) } // AR 길찾기 목표 (끝내면 null)
    var torch by remember { mutableStateOf(false) } // 어두운 곳에서 바닥 인식을 돕는 플래시
    // 두 손가락 벌리기·오므리기 = 카메라 화면 확대·축소 (디지털 줌: 카메라 영상과 캡슐을 함께 키운다. 저장되는 값이 아니다)
    var zoom by remember { mutableFloatStateOf(1f) }
    LaunchedEffect(zoom) {
        findTextureView(view.rootView)?.let {
            it.scaleX = zoom
            it.scaleY = zoom
        }
    }

    // 서버 저장: [완료]를 누르면 이름을 받고 사진·위치와 함께 게시한다 (홈·지도에 나온다)
    val scope = rememberCoroutineScope()
    var locationGranted by remember { mutableStateOf(hasLocationPermission(context)) }
    val askLocation = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { r -> locationGranted = r.values.any { it } }
    LaunchedEffect(Unit) {
        if (!locationGranted) askLocation.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION))
    }
    val location by rememberLocation(locationGranted)
    var naming by remember { mutableStateOf<Capsule?>(null) } // 이름을 받고 있는 캡슐
    // 저장 진행 표시: 자리를 구글에 고정하는 동안(몇 초~수십 초) 카메라로 캡슐을 계속 비춰야 해서, 끝날 때까지 눈에 띄게 알린다
    var saveStatus by remember { mutableStateOf<SaveStatus?>(null) }
    var pendingLeave by remember { mutableStateOf<(() -> Unit)?>(null) } // 저장 중에 나가려 할 때 확인을 받을 동작
    val saving = saveStatus?.kind == SaveKind.SAVING
    val leave = { action: () -> Unit -> if (saving) pendingLeave = action else action() }
    BackHandler(enabled = saving) { pendingLeave = onHome }
    var title by remember { mutableStateOf("") }

    // AR 길찾기 3D 화살표: 방향은 NavGuide가 주고(navTurn), 자리는 매 프레임 카메라 앞 바닥 쪽으로 옮긴다
    val navTurn = remember { floatArrayOf(Float.NaN) }
    val navAnchor = remember { arrayOfNulls<Capsule>(1) } // 길찾기 목표 캡슐이 AR에서 이미 찾아졌으면 그 캡슐
    val anchoredTarget = guiding?.let { g -> all.firstOrNull { it.serverId == g.id } }
    SideEffect { navAnchor[0] = anchoredTarget }
    var navPos by remember { mutableStateOf(Position()) }
    var navYaw by remember { mutableFloatStateOf(0f) }
    var navShown by remember { mutableStateOf(false) }

    fun resize(v: Float) {
        val next = v.coerceIn(0.1f, 2.0f)
        val t = selected ?: current
        if (t != null) t.sizeM = next
        if (t == null || t === current) sizeM = next // 다음에 놓을 것의 기본값
    }

    fun rotate(v: Float) {
        val t = selected ?: current
        if (t != null) t.rotDeg = v
        if (t == null || t === current) rotDeg = v
    }

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

    // AR 화면 촬영: 카메라 영상과 캡슐만 찍힌다(버튼·상태 카드는 다른 층이라 빠진다)
    fun capture() {
        // TextureView면 그 화면(카메라 영상 + 캡슐)을 그대로 비트맵으로 받는다
        val tex = findTextureView(view.rootView)
        if (tex != null) {
            val bmp = tex.bitmap
            val ok = bmp != null && saveToGallery(context, bmp)
            if (ok) view.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS)
            log(if (ok) "촬영했어요 · 갤러리의 Drop 폴더에 저장했어요" else "촬영하지 못했어요")
            return
        }
        val surface = findSurfaceView(view.rootView)
        if (surface == null || surface.width == 0) {
            log("촬영하지 못했어요")
            return
        }
        val shot = Bitmap.createBitmap(surface.width, surface.height, Bitmap.Config.ARGB_8888)
        PixelCopy.request(surface, shot, { result ->
            val ok = result == PixelCopy.SUCCESS && saveToGallery(context, shot)
            if (ok) view.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS)
            log(if (ok) "촬영했어요 · 갤러리의 Drop 폴더에 저장했어요" else "촬영하지 못했어요")
        }, Handler(Looper.getMainLooper()))
    }

    // 서버 캡슐의 클라우드 앵커를 찾아 그 자리에 띄운다. 사진은 썸네일을 받아 쓴다
    val resolvePolicy = remember { ResolvePolicy(NP_02_RESOLVE_RANGE_M) }

    // 신고한 캡슐을 화면에서 치운다 (서버는 이미 이 사람에게 그 캡슐을 보내지 않는다)
    fun hideCapsule(c: Capsule) {
        c.anchor.detach()
        if (c === selected) selected = null
        remote.remove(c)
        done.remove(c)
    }

    // 차단한 뒤 서버 캡슐을 모두 내리고 다시 받는다 (누가 남겼는지 앱은 모르므로, 서버가 걸러서 주는 목록으로 다시 채운다)
    fun reloadRemote() {
        remote.forEach { it.anchor.detach() }
        remote.clear()
        selected = null
        loadedIds.clear()
        loadedIds.addAll(done.mapNotNull { it.serverId })
    }
    fun resolveRemote(serverId: String, anchorId: String, thumbUrl: String, grade: String, sizeM: Float, heading: Float, mine: Boolean) {
        val s = session ?: return
        loadedIds.add(serverId)
        scope.launch {
            val photo = api.bitmap(thumbUrl) ?: bitmap
            try {
                s.resolveCloudAnchorAsync(anchorId) { anchor, state ->
                    main.post {
                        if (state == Anchor.CloudAnchorState.SUCCESS && anchor != null) {
                            seq += 1
                            remote.add(Capsule("s$seq", anchor, grade, photo, sizeM, heading, mine).also { it.serverId = serverId })
                            resolvePolicy.onSuccess(serverId)
                            log("RESOLVE_OK $serverId")
                        } else {
                            // 아직 그 자리를 비추지 않았다. 점점 느리게 다시 찾는다 (한도 초과면 잠시 모두 멈춘다)
                            anchor?.detach()
                            loadedIds.remove(serverId)
                            resolvePolicy.onFail(serverId, state.name, System.currentTimeMillis())
                        }
                    }
                }
            } catch (e: Exception) {
                loadedIds.remove(serverId)
                resolvePolicy.onFail(serverId, "ERROR_INTERNAL", System.currentTimeMillis())
                log("RESOLVE_EXCEPTION ${e.javaClass.simpleName}: ${e.message}")
            }
        }
    }

    // 캡슐을 연다. 실제 앱은 여기서 결제(영수증 검증)와 서버 열람 판정을 거친다
    fun open(c: Capsule) {
        c.opened = true
        c.paid = true
        buzz()
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
            val h = if (c.closed) 0.2f else if (c.grade == BRONZE) photoH / 2f else 0.32f + photoH / 2f
            val reach = if (c.closed) 0.3f else maxOf(0.25f, c.sizeM * 0.6f)
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
            c in remote -> remote.remove(c)
            else -> done.remove(c)
        }
        c.serverId?.let { sid ->
            scope.launch {
                try {
                    api.request("DELETE", "/api/capsules/$sid")
                } catch (e: ApiException) {
                    log("서버에서 지우지 못했어요: ${e.message}")
                }
            }
        }
        buzz()
        log("DELETED ${c.id}")
    }

    // AR 화면에 있는 동안 주변(반경 M-01)의 서버 캡슐을 받아, 앵커가 있는 것을 가까운 순서로 NP-07개까지 제자리에 띄운다.
    // 자리를 못 찾은 것은 주기마다 다시 시도한다 (그 자리를 비추면 나타난다)
    val ready = session != null && location != null
    LaunchedEffect(ready) {
        if (!ready) return@LaunchedEffect
        while (true) {
            val here = location ?: break
            try {
                val list = api.request("GET", "/api/capsules/nearby?lat=${here.latitude}&lng=${here.longitude}")!!.getJSONArray("capsules")
                val pending = List(list.length()) { list.getJSONObject(it) }
                    .filter { !it.isNull("cloud_anchor_id") && it.getString("id") !in loadedIds }
                    .filter { resolvePolicy.shouldTry(it.getString("id"), distanceM(here.latitude, here.longitude, it.getDouble("lat"), it.getDouble("lng")), System.currentTimeMillis()) }
                    .sortedBy { distanceM(here.latitude, here.longitude, it.getDouble("lat"), it.getDouble("lng")) }
                for (c in pending) {
                    if (loadedIds.size >= NP_07_MAX_RESOLVING) break
                    resolveRemote(c.getString("id"), c.getString("cloud_anchor_id"), c.getString("thumb_url"), c.getString("grade"), c.getDouble("size_m").toFloat(), c.getDouble("heading").toFloat(), c.getBoolean("is_mine"))
                }
            } catch (e: ApiException) {
                log("주변 캡슐을 불러오지 못했어요: ${e.message}")
            }
            delay(NP_12_NEARBY_REFRESH_MS)
        }
    }

    // 접근 연출: 닫힌 캡슐의 반경 안으로 들어오는 순간 한 번 진동·효과음
    val nearCapsules = all.filter { it.closed && it.dist <= NEAR_M }
    LaunchedEffect(nearCapsules.joinToString { it.id }) {
        if (nearCapsules.isNotEmpty()) {
            buzz()
            Log.i(TAG, "NEAR ${nearCapsules.joinToString { it.id }}")
        }
    }

    Box(
        Modifier.fillMaxSize().pointerInput(Unit) {
            awaitEachGesture {
                awaitFirstDown(requireUnconsumed = false, pass = PointerEventPass.Initial)
                var prevSpan = 0f
                do {
                    val event = awaitPointerEvent(PointerEventPass.Initial)
                    val down = event.changes.filter { it.pressed }
                    if (down.size >= 2) {
                        val span = (down[0].position - down[1].position).getDistance()
                        if (prevSpan > 0f && span > 0f) zoom = (zoom * span / prevSpan).coerceIn(ZOOM_MIN, ZOOM_MAX)
                        prevSpan = span
                    } else {
                        prevSpan = 0f
                    }
                } while (event.changes.any { it.pressed })
            }
        },
    ) {
        ARSceneView(
            // 화면 확대·축소는 TextureView를 직접 키우므로 SurfaceView 대신 TextureView로 그린다
            surfaceType = SurfaceType.TextureSurface,
            modifier = Modifier.fillMaxSize(),
            engine = engine,
            materialLoader = materialLoader,
            planeRenderer = true,
            cloudAnchorMode = Config.CloudAnchorMode.ENABLED,
            flashMode = if (torch) Config.FlashMode.TORCH else Config.FlashMode.OFF,
            onSessionCreated = {
                session = it
                Log.i(TAG, "SESSION_CREATED")
            },
            onSessionFailed = { e -> log("SESSION_FAILED ${e.javaClass.simpleName}: ${e.message}") },
            onSessionUpdated = { s, f ->
                frameHolder[0] = f
                val turn = navTurn[0]
                // AR로 목표 캡슐의 자리를 이미 찾았으면 GPS·나침반 대신 AR이 아는 정확한 위치를 가리킨다
                val target = navAnchor[0]?.takeIf { it.anchor.trackingState == TrackingState.TRACKING }
                val showArrow = f.camera.trackingState == TrackingState.TRACKING &&
                    (if (target != null) target.dist > NP_13_NAV_ANCHOR_ARRIVE_M else !turn.isNaN())
                if (navShown != showArrow) navShown = showArrow
                if (showArrow) {
                    val cam = f.camera.pose
                    val z = cam.zAxis
                    val len = kotlin.math.hypot(z[0], z[2]).coerceAtLeast(0.001f)
                    val fx = -z[0] / len
                    val fz = -z[2] / len
                    var dx: Double
                    var dz: Double
                    if (target != null) {
                        val ax = (target.anchor.pose.tx() - cam.tx()).toDouble()
                        val az = (target.anchor.pose.tz() - cam.tz()).toDouble()
                        val l = Math.hypot(ax, az).coerceAtLeast(0.001)
                        dx = ax / l
                        dz = az / l
                    } else {
                        // 카메라가 보는 방향(바닥에 눕힌 것)을 목표 쪽으로 turn만큼 오른쪽으로 돌린 방향
                        val rad = Math.toRadians(turn.toDouble())
                        dx = fx * Math.cos(rad) - fz * Math.sin(rad)
                        dz = fz * Math.cos(rad) + fx * Math.sin(rad)
                    }
                    navPos = Position(cam.tx() + fx * 1.6f, cam.ty() - 0.7f, cam.tz() + fz * 1.6f)
                    navYaw = Math.toDegrees(Math.atan2(-dx, -dz)).toFloat()
                }
                val now = System.currentTimeMillis()
                if (now - lastTick > 250 && f.camera.trackingState == TrackingState.TRACKING) {
                    lastTick = now
                    val cam = f.camera.pose
                    // 카메라가 보는 방향을 바닥에 눕혀 "앞"으로 삼는다 (폰을 숙여도 미니맵이 흔들리지 않게)
                    val z = cam.zAxis
                    val len = kotlin.math.hypot(z[0], z[2]).coerceAtLeast(0.001f)
                    val fx = -z[0] / len
                    val fz = -z[2] / len
                    all.forEach {
                        it.dist = distance(cam, it.anchor.pose)
                        val dx = it.anchor.pose.tx() - cam.tx()
                        val dz = it.anchor.pose.tz() - cam.tz()
                        it.mapX = dx * -fz + dz * fx
                        it.mapY = dx * fx + dz * fz
                    }
                    if (current != null) {
                        quality = runCatching { s.estimateFeatureMapQualityForHosting(cam).name }.getOrElse { "-" }
                    }
                }
            },
            onGestureListener = rememberOnGestureListener(
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
                            val placedGrade = old?.grade ?: grade
                            val what = if (placedGrade == BRONZE) "브론즈(사진이 바로 보임)" else "${gradeLabel(placedGrade)}(닫힌 캡슐)"
                            log(if (old == null) "PLACED $what · 자리를 정했으면 [완료]를 누르세요" else "MOVED $what")
                        }
                    }
                },
            ),
        ) {
            NavArrow(materialLoader, navPos, navYaw, navShown && guiding != null)
            all.forEach { item ->
                // 캡슐마다 노드 묶음을 따로 만든다. 옮기면 ID가 바뀌어 통째로 새로 만들어진다
                key(item.id) { CapsuleNode(item, item === selected, item === current, materialLoader, modelLoader, sfx) }
            }
        }

        payFor?.let { c ->
            AlertDialog(
                onDismissRequest = { payFor = null },
                title = { Text("${gradeLabel(c.grade)} 상자입니다") },
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

        // 저장 중에 나가려 할 때: 저장이 끊긴다고 알리고 확인을 받는다
        pendingLeave?.let { action ->
            AlertDialog(
                onDismissRequest = { pendingLeave = null },
                title = { Text("저장 중이에요") },
                text = { Text("지금 나가면 캡슐이 저장되지 않아요. \"저장 완료\"가 나타날 때까지 놓은 캡슐을 계속 비춰 주세요.") },
                confirmButton = { TextButton(onClick = { pendingLeave = null }) { Text("계속 비추기") } },
                dismissButton = {
                    TextButton(onClick = {
                        pendingLeave = null
                        action()
                    }) { Text("그래도 나가기", color = Tokens.Error) }
                },
            )
        }

        // 캡슐 이름 받기 → 서버에 저장
        naming?.let { c ->
            AlertDialog(
                onDismissRequest = { naming = null },
                title = { Text("캡슐을 저장하시겠습니까?") },
                text = {
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        TextField(
                            value = title,
                            onValueChange = { if (it.length <= M_11_TITLE_MAX_LENGTH) title = it },
                            singleLine = true,
                            placeholder = { Text("캡슐 이름 (예: 한강 첫 데이트)") },
                        )
                        Text("저장하려면 \"저장 완료\"가 나타날 때까지 놓은 캡슐을 계속 비춰 주세요. 그 전에 앱을 끄거나 화면을 나가면 저장되지 않아요.", fontSize = 13.sp)
                    }
                },
                confirmButton = {
                    TextButton(enabled = title.isNotBlank(), onClick = {
                        naming = null
                        val name = title.trim()
                        val here = location
                        if (here == null) {
                            log("현재 위치를 몰라 서버에 저장하지 못했어요 (이 화면에만 남아요)")
                            saveStatus = SaveStatus(SaveKind.FAILED, "현재 위치를 몰라 저장하지 못했어요")
                        } else {
                            log("'$name' 저장 중…")
                            saveStatus = SaveStatus(SaveKind.SAVING, "'$name' 저장 중… 놓은 캡슐을 계속 비춰 주세요")
                            scope.launch {
                                try {
                                    // 먼저 그 자리를 구글에 고정하고(다시 와서 같은 자리에 보이게), 그 ID와 함께 서버에 올린다
                                    val s = session
                                    val host = if (s == null) {
                                        HostResult.Failed("AR 화면이 아직 준비되지 않았어요")
                                    } else {
                                        hostAnchor(s, c.anchor, anchorTtlDays(c.grade), { frameHolder[0]?.camera?.pose }) { msg -> saveStatus = SaveStatus(SaveKind.SAVING, msg) }
                                    }
                                    val anchorId = (host as? HostResult.Ok)?.id
                                    val sid = publishCapsule(api, c.bitmap, name, here.latitude, here.longitude, here.accuracy, c.rotDeg, anchorId, c.sizeM, c.grade)
                                    c.serverId = sid
                                    c.savedSizeM = c.sizeM
                                    c.savedRotDeg = c.rotDeg
                                    loadedIds.add(sid) // 이미 화면에 있으니 다시 찾지 않는다
                                    log("'$name' 저장했어요 · 홈과 지도에 나와요" + (if (anchorId == null) " (자리 고정은 실패해 AR에서는 다시 안 보여요)" else ""))
                                    saveStatus = SaveStatus(
                                        if (anchorId == null) SaveKind.FAILED else SaveKind.DONE,
                                        if (anchorId == null) "'$name'은(는) 저장됐지만 자리 고정에 실패해 AR에서는 다시 안 보여요. ${(host as? HostResult.Failed)?.reason ?: ""}" else "'$name' 저장 완료 · 이제 이 자리를 벗어나도 돼요",
                                    )
                                } catch (e: ApiException) {
                                    log("'$name' 저장 실패: ${e.message}")
                                    saveStatus = SaveStatus(SaveKind.FAILED, "'$name' 저장 실패: ${e.message}")
                                }
                                // 완료·실패 안내는 잠깐 보여 준 뒤 지운다
                                delay(if (saveStatus?.kind == SaveKind.FAILED) 6000 else 4000)
                                if (saveStatus?.kind != SaveKind.SAVING) saveStatus = null
                            }
                        }
                    }) { Text("저장") }
                },
                dismissButton = { TextButton(onClick = { naming = null }) { Text("저장 안 함") } },
            )
        }

        // 신고: 사유를 고르면 바로 접수하고 이 캡슐은 더 이상 보이지 않는다
        reportFor?.let { c ->
            AlertDialog(
                onDismissRequest = { reportFor = null },
                title = { Text("이 캡슐을 신고할까요?") },
                text = {
                    Column {
                        Text("신고하면 이 캡슐이 더 이상 보이지 않고, 운영자가 검토해요. 사유를 골라 주세요.", fontSize = 13.sp)
                        for ((code, label) in REPORT_REASONS) {
                            TextButton(onClick = {
                                reportFor = null
                                val sid = c.serverId ?: return@TextButton
                                scope.launch {
                                    try {
                                        api.request("POST", "/api/capsules/$sid/report", JSONObject().put("reason", code))
                                        hideCapsule(c)
                                        log("신고했어요 · 이 캡슐은 더 이상 보이지 않아요")
                                    } catch (e: ApiException) {
                                        log("신고하지 못했어요: ${e.message}")
                                    }
                                }
                            }) { Text(label) }
                        }
                    }
                },
                confirmButton = {},
                dismissButton = { TextButton(onClick = { reportFor = null }) { Text("취소") } },
            )
        }

        // 차단: 이 캡슐을 남긴 사람의 모든 캡슐이 나에게 보이지 않는다
        blockFor?.let { c ->
            AlertDialog(
                onDismissRequest = { blockFor = null },
                title = { Text("이 캡슐을 남긴 사람을 차단할까요?") },
                text = { Text("그 사람의 모든 캡슐이 나에게 보이지 않아요. 홈의 \"차단 목록\"에서 풀 수 있어요.") },
                confirmButton = {
                    TextButton(onClick = {
                        blockFor = null
                        val sid = c.serverId ?: return@TextButton
                        scope.launch {
                            try {
                                api.request("POST", "/api/capsules/$sid/block-owner")
                                reloadRemote()
                                log("차단했어요 · 그 사람의 캡슐이 더 이상 보이지 않아요")
                            } catch (e: ApiException) {
                                log("차단하지 못했어요: ${e.message}")
                            }
                        }
                    }) { Text("차단", color = Tokens.Error) }
                },
                dismissButton = { TextButton(onClick = { blockFor = null }) { Text("취소") } },
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

        // 위: 홈으로 돌아가기 + 상태. 상태 표시줄·카메라 구멍과 겹치지 않게 안쪽으로 넣는다
        Column(
            Modifier.align(Alignment.TopCenter).fillMaxWidth().statusBarsPadding().padding(horizontal = 16.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
            horizontalAlignment = Alignment.End,
        ) {
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.Top,
        ) {
            Pill("‹ 홈", { leave(onHome) })
            Column(Modifier.weight(1f).clip(PanelShape).background(Tokens.Surface).padding(horizontal = 14.dp, vertical = 10.dp)) {
                Text(status, color = Tokens.HomeText, fontSize = 13.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Text(
                    "놓은 캡슐 ${done.size}개" + (if (current != null) " + 놓는 중 1개" else "") + " · 스캔 품질 $quality",
                    color = Tokens.HomeSub,
                    fontSize = 11.sp,
                )
                if (remote.isNotEmpty() || loadedIds.size > remote.size) {
                    Text(
                        "서버 캡슐 ${remote.size}개 표시" + (if (loadedIds.size > remote.size) " · 자리를 찾는 중… 놓았던 곳을 비춰 주세요" else ""),
                        color = Tokens.Amber,
                        fontSize = 11.sp,
                    )
                }
            }
        }
            MiniMap(all)
        }

        guiding?.let {
            NavGuide(
                it,
                anchorDist = anchoredTarget?.dist,
                onTurn = { t -> navTurn[0] = t ?: Float.NaN },
                onStop = {
                    navTurn[0] = Float.NaN
                    guiding = null
                },
                onMap = { leave(onMap) },
                // 3D 화살표를 가리지 않게 화면 위쪽에 둔다
                modifier = Modifier.align(Alignment.TopCenter).statusBarsPadding().padding(top = 230.dp),
            )
        }

        // 아래: 하단 내비게이션 막대와 겹치지 않게 안쪽으로 넣는다
        Column(
            Modifier.align(Alignment.BottomCenter).fillMaxWidth().navigationBarsPadding().padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            if (zoom > 1.02f) Pill("🔍 ${"%.1f".format(zoom)}× · 눌러서 원래대로", { zoom = 1f }, small = true)
            // 저장 진행·완료 안내: 아래 영역의 맨 위에 두어 위쪽의 상태 카드·미니맵과 겹치지 않게 한다
            saveStatus?.let { SaveBanner(it) }

            // 크기·회전과 동작: 캡슐을 골랐거나 놓는 중일 때만 보인다
            target?.let { t ->
                Column(Modifier.fillMaxWidth().clip(PanelShape).background(Tokens.Surface).padding(horizontal = 14.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    // 오른쪽 위 화살표로 크기·회전 슬라이더를 접었다 편다. 처음에는 접혀 있다
                    Row(Modifier.fillMaxWidth().clickable { panelOpen = !panelOpen }, verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            (if (selected != null) "고른 캡슐" else "놓는 중인 캡슐") + " · 크기 ${"%.2f".format(t.sizeM)}m" + (if (t.changed) " · 바뀜(저장 전)" else if (panelOpen) "" else " (눌러서 크기·회전 조절)"),
                            color = Tokens.HomeText,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.weight(1f),
                        )
                        Text(if (panelOpen) "▾" else "▴", color = Tokens.Amber, fontSize = 18.sp, modifier = Modifier.padding(horizontal = 8.dp))
                    }
                    if (panelOpen) {
                        val sliderColors = SliderDefaults.colors(thumbColor = Tokens.Amber, activeTrackColor = Tokens.Amber, inactiveTrackColor = Tokens.CardLine)
                        CompactSlider("크기 ${"%.2f".format(t.sizeM)}m", t.sizeM, 0.1f..2.0f, sliderColors) { resize(it) }
                        // 가운데가 0°, 왼쪽 -180° ~ 오른쪽 +180°. 예전에 0~359로 저장한 값도 같은 범위로 옮겨 보여 준다
                        val rot = if (t.rotDeg > 180f) t.rotDeg - 360f else t.rotDeg
                        CompactSlider("회전 ${if (rot > 0) "+" else ""}${rot.toInt()}°", rot, -180f..180f, sliderColors) { rotate(it) }
                    }
                    // 고른 캡슐에 할 수 있는 동작
                    selected?.let { c ->
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            if (c.grade != BRONZE && !c.opened) {
                                // 이미 결제한 캡슐은 다시 묻지 않고 연다
                                Pill("열기", {
                                    when {
                                        // 놓는 중([완료] 전)에는 크기를 맞춰 볼 수 있게 결제 없이 바로 연다
                                        c === current -> {
                                            c.opened = true
                                            log("PREVIEW ${c.id} · 놓는 중이라 결제 없이 열었어요")
                                        }
                                        c.paid -> open(c)
                                        else -> payFor = c
                                    }
                                }, primary = true)
                            }
                            if (c.grade != BRONZE && c.opened) {
                                Pill("닫기", {
                                    c.opened = false
                                    log("CLOSED ${c.id}")
                                })
                            }
                            if (!c.closed) {
                                // 사진이 보이는 캡슐만 받을 수 있다 (닫힌 상자는 열어야 한다)
                                Pill("받기", {
                                    log(if (saveToGallery(context, c.bitmap)) "DOWNLOADED ${c.id} · 갤러리의 Drop 폴더에 저장했어요" else "사진을 저장하지 못했어요")
                                })
                            }
                            // 한 번 저장한 캡슐도 주인은 크기·방향을 다시 정할 수 있다(위치는 바꿀 수 없다)
                            if (c.mine && c.changed) {
                                Pill("변경 저장", {
                                    val sid = c.serverId ?: return@Pill
                                    val size = c.sizeM
                                    val rot = c.rotDeg
                                    scope.launch {
                                        try {
                                            api.request("PATCH", "/api/capsules/$sid", JSONObject().put("size_m", size.toDouble()).put("heading", ((Math.round(rot) % 360) + 360) % 360))
                                            c.savedSizeM = size
                                            c.savedRotDeg = rot
                                            log("크기·방향을 저장했어요")
                                        } catch (e: ApiException) {
                                            log("변경을 저장하지 못했어요: ${e.message}")
                                        }
                                    }
                                }, primary = true)
                            }
                            // 다른 사람의 캡슐은 신고하거나 그 사람을 차단할 수 있다
                            if (!c.mine && c.serverId != null) {
                                Pill("신고", { reportFor = c }, danger = true)
                                Pill("차단", { blockFor = c }, danger = true)
                            }
                            Pill("삭제", { if (c.mine) deleteFor = c else log("NOT_OWNER ${c.id} · 이 캡슐의 주인만 삭제할 수 있어요") }, danger = true)
                            Pill("해제", { selected = null })
                        }
                    }
                }
            }
            // 놓기: 등급 고르기 → 사진 고르기 → (평면을 눌러 놓은 뒤) 완료
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                Pill("● ${gradeLabel(grade)}", { grade = GRADES[(GRADES.indexOf(grade) + 1) % GRADES.size] }, textColor = when (grade) { BRONZE -> Tokens.Bronze; SILVER -> Tokens.Silver; else -> Tokens.Diamond })
                Pill("사진 고르기", { picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) })
                // 지금 고른 사진이 맞는지 알아볼 정도의 작은 미리 보기
                Image(bitmap.asImageBitmap(), contentDescription = "고른 사진", modifier = Modifier.size(36.dp).clip(RoundedCornerShape(8.dp)), contentScale = ContentScale.Crop)
                Box(Modifier.weight(1f))
                Pill("완료", {
                    val c = current
                    if (c == null) {
                        log("놓고 있는 캡슐이 없어요. 평면을 눌러 놓아 주세요")
                    } else {
                        // 미리 보기로 열어 둔 상자는 다시 닫아서 놓는다
                        if (!c.paid) c.opened = false
                        done.add(c)
                        current = null
                        title = ""
                        naming = c
                        log("DONE ${c.id} · 다른 곳을 누르면 새 캡슐을 놓아요 (지금 ${done.size}개)")
                    }
                }, primary = true, enabled = current != null)
            }
            // 실험용 동작
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                Pill("모두 닫기", {
                    all.forEach { it.opened = false }
                    log("캡슐을 다시 닫았어요")
                }, small = true)
                Pill(if (torch) "플래시 끄기" else "플래시", { torch = !torch }, small = true)
                Box(Modifier.weight(1f))
                // 촬영 버튼
                Box(
                    Modifier.size(48.dp).clip(CircleShape).background(Tokens.Surface).border(2.dp, Tokens.HomeText, CircleShape).clickable { capture() },
                    contentAlignment = Alignment.Center,
                ) { Box(Modifier.size(34.dp).clip(CircleShape).background(Tokens.HomeText)) }
            }
        }
    }
}

