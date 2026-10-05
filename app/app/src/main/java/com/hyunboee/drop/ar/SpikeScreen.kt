package com.hyunboee.drop.ar

// OPS-N04 실증에서 만든 AR 실험 화면 (docs/12-native-plan.md). 로그인 뒤에 보이는 임시 화면이며,
// APP-05 이후 Task에서 서버와 연결된 실제 AR 화면으로 바꾼다.
// 확인하는 것: 키 없는 인증으로 30일 보관 앵커 저장·인식, SceneView 사진 액자, 사진 선택기
// 추가 실험: 등급별 표시 — 브론즈는 사진 액자가 그대로 보이고, 상위 등급은 닫힌 캡슐을 열어야 보인다
//   (docs/13-capsule-dev-plan.md 3장의 대기 → 접근 → 개봉). 3D 모델 파일이 없어 상자 모양으로 대신한다.

import android.Manifest
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
import android.content.ContentValues
import android.os.Build
import android.provider.MediaStore
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
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Slider
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
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size as UiSize
import androidx.compose.ui.graphics.Color as UiColor
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.hyunboee.drop.M_11_TITLE_MAX_LENGTH
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
import com.google.ar.core.Pose
import com.google.ar.core.Session
import com.google.ar.core.TrackingState
import io.github.sceneview.SurfaceType
import io.github.sceneview.ar.ARSceneView
import io.github.sceneview.math.Direction
import io.github.sceneview.math.Position
import io.github.sceneview.math.Rotation
import io.github.sceneview.math.Scale
import io.github.sceneview.math.Size
import io.github.sceneview.rememberEngine
import io.github.sceneview.rememberMaterialLoader
import io.github.sceneview.rememberModelInstance
import io.github.sceneview.rememberModelLoader
import io.github.sceneview.rememberOnGestureListener
import kotlinx.coroutines.delay

private const val TAG = "DropSpike"
private const val TTL_DAYS = 30

// 실험용 "접근 연출이 시작되는 거리". 실제 앱은 서버가 GPS로 10m(PRM-01)를 판정한다. 실내에서 걸어 보며 확인하려고 짧게 잡았다
private const val NEAR_M = 1.5f

private const val BRONZE = "BRONZE"
private const val SILVER = "SILVER"

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

// 사진을 기기 갤러리(Pictures/Drop)에 저장한다. Android 10 이상은 권한 없이 된다
internal fun saveToGallery(context: Context, bitmap: Bitmap): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return false // 실증 앱은 Android 10 이상만 다룬다
    val resolver = context.contentResolver
    val values = ContentValues().apply {
        put(MediaStore.Images.Media.DISPLAY_NAME, "drop_${System.currentTimeMillis()}.jpg")
        put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg")
        put(MediaStore.Images.Media.RELATIVE_PATH, "Pictures/Drop")
        put(MediaStore.Images.Media.IS_PENDING, 1)
    }
    val uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values) ?: return false
    return try {
        resolver.openOutputStream(uri)?.use { bitmap.compress(Bitmap.CompressFormat.JPEG, 92, it) } ?: return false
        values.clear()
        values.put(MediaStore.Images.Media.IS_PENDING, 0)
        resolver.update(uri, values, null, null)
        true
    } catch (e: Exception) {
        resolver.delete(uri, null, null)
        false
    }
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
    var serverId: String? = null // 서버에 저장된 캡슐이면 그 ID
    // 서버에 저장된 크기·방향. 지금 값과 다르면 "변경 저장"을 보여 준다
    var savedSizeM: Float = sizeM
    var savedRotDeg: Float = rotDeg
    val changed get() = serverId != null && (kotlin.math.abs(this.sizeM - savedSizeM) > 0.005f || kotlin.math.abs(rotDeg - savedRotDeg) > 0.5f)
    var bitmap by mutableStateOf(bitmap)
    var sizeM by mutableFloatStateOf(sizeM) // 사진 긴 변 길이(m)
    var rotDeg by mutableFloatStateOf(rotDeg) // 세로축 회전(도)
    var dist by mutableFloatStateOf(99f)
    var mapX by mutableFloatStateOf(0f) // 미니맵: 내 오른쪽으로 몇 m
    var mapY by mutableFloatStateOf(0f) // 미니맵: 내 앞으로 몇 m
    var opened by mutableStateOf(false)
    var paid by mutableStateOf(false) // 한 번 결제해서 연 캡슐 (다시 열 때 결제를 묻지 않는다)
    val closed get() = grade != BRONZE && !opened
}

@Composable
fun SpikeScreen(api: ApiClient, navTarget: MapPin?, onHome: () -> Unit, onMap: () -> Unit) {
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
                            log("RESOLVE_OK $serverId")
                        } else {
                            // 아직 그 자리를 비추지 않았다. 다음 주기에 다시 찾는다
                            anchor?.detach()
                            loadedIds.remove(serverId)
                        }
                    }
                }
            } catch (e: Exception) {
                loadedIds.remove(serverId)
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
                            val what = if ((old?.grade ?: grade) == BRONZE) "브론즈(사진이 바로 보임)" else "실버(닫힌 캡슐)"
                            log(if (old == null) "PLACED $what · 자리를 정했으면 [완료]를 누르세요" else "MOVED $what")
                        }
                    }
                },
            ),
        ) {
            // AR 길찾기 화살표: 반투명 파란 갈매기 무늬 세 개가 목표 쪽으로 흘러간다.
            // 다른 노드처럼 항상 두고 크기로 숨긴다. 재질도 노드마다 따로 만든다
            val arrowMats = remember { List(6) { materialLoader.createUnlitColorInstance(UiColor(0x8C2EA8FF)) } }
            val flow by rememberInfiniteTransition(label = "nav").animateFloat(0f, 1f, infiniteRepeatable(tween(900, easing = LinearEasing)), label = "flow")
            Node(position = navPos, rotation = Rotation(y = navYaw), scale = Scale(if (navShown && guiding != null) 1f else 0.0001f)) {
                for (i in 0 until 3) {
                    val z = 0.45f - (i + flow) * 0.35f // 앞(-z)으로 흐른다
                    // 양 끝에서 작아졌다 커져 끊김 없이 이어져 보인다
                    val grow = Scale(kotlin.math.sin(Math.PI * (i + flow) / 3.0).toFloat().coerceAtLeast(0.05f))
                    CubeNode(size = Size(0.34f, 0.02f, 0.08f), materialInstance = arrowMats[i * 2], position = Position(x = -0.11f, z = z + 0.11f), rotation = Rotation(y = 45f), scale = grow)
                    CubeNode(size = Size(0.34f, 0.02f, 0.08f), materialInstance = arrowMats[i * 2 + 1], position = Position(x = 0.11f, z = z + 0.11f), rotation = Rotation(y = -45f), scale = grow)
                }
            }

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
                            // 놓는 중([완료] 전)인 캡슐의 노란 테두리. 사진 뒤에 조금 더 큰 노란 판을 대고, 상자 밑에는 노란 받침을 깐다.
                            // 다른 노드처럼 항상 두고 크기로 숨긴다. [완료]를 누르면 사라진다
                            val placing = item === current
                            val edge = 0.03f // 테두리 폭(m)
                            val edgeMats = remember { List(2) { materialLoader.createUnlitColorInstance(UiColor(0xFFFFD21E)) } }
                            if (item.grade == BRONZE) {
                                CubeNode(
                                    size = Size(1f, 1f, 0.004f),
                                    materialInstance = edgeMats[0],
                                    position = Position(y = ph / 2f, z = -0.004f),
                                    scale = if (placing) Scale(item.sizeM * baseW + edge, ph + edge, 1f) else Scale(0.0001f),
                                )
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
                                // 솟아오름·내려감·열림 소리: 상태가 바뀐 순간에만 낸다 (처음 그려질 때는 내지 않는다)
                                val risen = near || item.opened || item === selected
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
                                val rise by animateFloatAsState(if (near || item.opened || item === selected) 1f else 0f, tween(1200), label = "rise")
                                val open by animateFloatAsState(if (item.opened) 1f else 0f, tween(800), label = "open")
                                // 캡슐 모델(몸통·뚜껑). 노드는 항상 두고, 상태 색은 아래 받침 원판의 색으로 알린다.
                                // 상태 색: 고른 것은 파란색, 이미 결제한 것은 회색, 가까이 가면 금색, 그 밖은 어두운 갈색.
                                // (재질을 바꿔 끼우지 않으려고 색마다 원판을 따로 두고 하나만 보이게 한다)
                                val bodyModel = rememberModelInstance(modelLoader, "models/capsule_body.glb")
                                val lidModel = rememberModelInstance(modelLoader, "models/capsule_lid.glb")
                                val stateColors = listOf(UiColor(0xFF6B5A3A), UiColor(0xFFE9D39A), UiColor(0xFF1E6BFF), UiColor(0xFF9A9A9A))
                                val stateMats = remember { stateColors.map { materialLoader.createUnlitColorInstance(it) } }
                                val glowMats = remember { List(9) { materialLoader.createUnlitColorInstance(UiColor(0xFFFFF4C2)) } }
                                val hidden = 0.0001f
                                val shown = when {
                                    item === selected -> 2 // 파란색
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
                                        scale = Scale(if (i == shown) 1f else hidden),
                                    )
                                }
                                bodyModel?.let { ModelNode(modelInstance = it, position = Position(y = baseY)) }
                                // 열리면 뚜껑이 위로 들리며 뒤로 젖혀진다
                                lidModel?.let {
                                    ModelNode(modelInstance = it, position = Position(y = baseY + 0.323f + 0.18f * open, z = -0.10f * open), rotation = Rotation(x = -60f * open))
                                }
                                // 놓는 중([완료] 전) 노란 받침 (열어서 사진이 나오면 사진 뒤 노란 판으로 바뀐다)
                                CubeNode(
                                    size = Size(0.36f, 0.006f, 0.36f),
                                    materialInstance = edgeMats[0],
                                    position = Position(y = 0.004f),
                                    scale = Scale(if (placing && open < 0.5f) 1f else hidden),
                                )
                                CubeNode(
                                    size = Size(1f, 1f, 0.004f),
                                    materialInstance = edgeMats[1],
                                    position = Position(y = bodyY + 0.14f + (0.10f + ph / 2f) * open, z = -0.004f),
                                    scale = if (placing && open >= 0.5f) Scale((item.sizeM * baseW + edge) * open, (ph + edge) * open, 1f) else Scale(hidden),
                                )

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
                                    val anchorId = session?.let { hostAnchor(it, c.anchor) }
                                    val sid = publishCapsule(api, c.bitmap, name, here.latitude, here.longitude, here.accuracy, c.rotDeg, anchorId, c.sizeM, c.grade)
                                    c.serverId = sid
                                    c.savedSizeM = c.sizeM
                                    c.savedRotDeg = c.rotDeg
                                    loadedIds.add(sid) // 이미 화면에 있으니 다시 찾지 않는다
                                    log("'$name' 저장했어요 · 홈과 지도에 나와요" + (if (anchorId == null) " (자리 고정은 실패해 AR에서는 다시 안 보여요)" else ""))
                                    saveStatus = SaveStatus(
                                        if (anchorId == null) SaveKind.FAILED else SaveKind.DONE,
                                        if (anchorId == null) "'$name'은(는) 저장됐지만 자리 고정에 실패해 AR에서는 다시 안 보여요. 주변을 더 비추고 다시 놓아 주세요" else "'$name' 저장 완료 · 이제 이 자리를 벗어나도 돼요",
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
            saveStatus?.let { st ->
                Row(
                    Modifier
                        .fillMaxWidth()
                        .clip(PanelShape)
                        .background(Tokens.Surface)
                        .border(1.dp, when (st.kind) { SaveKind.SAVING -> Tokens.Amber; SaveKind.DONE -> UiColor(0xFF7BD88F); SaveKind.FAILED -> Tokens.Error }, PanelShape)
                        .padding(horizontal = 16.dp, vertical = 12.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    when (st.kind) {
                        SaveKind.SAVING -> CircularProgressIndicator(Modifier.size(22.dp), color = Tokens.Amber, strokeWidth = 2.5.dp)
                        SaveKind.DONE -> Text("✓", color = UiColor(0xFF7BD88F), fontSize = 20.sp, fontWeight = FontWeight.Bold)
                        SaveKind.FAILED -> Text("!", color = Tokens.Error, fontSize = 20.sp, fontWeight = FontWeight.Bold)
                    }
                    Text(st.text, color = Tokens.HomeText, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                }
            }

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
                            Pill("삭제", { if (c.mine) deleteFor = c else log("NOT_OWNER ${c.id} · 이 캡슐의 주인만 삭제할 수 있어요") }, danger = true)
                            Pill("해제", { selected = null })
                        }
                    }
                }
            }
            // 놓기: 등급 고르기 → 사진 고르기 → (평면을 눌러 놓은 뒤) 완료
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                Pill(if (grade == BRONZE) "● 브론즈" else "● 실버", { grade = if (grade == BRONZE) SILVER else BRONZE }, textColor = if (grade == BRONZE) Tokens.Bronze else Tokens.Silver)
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

private fun findTextureView(v: View): TextureView? = when (v) {
    is TextureView -> v
    is ViewGroup -> (0 until v.childCount).firstNotNullOfOrNull { findTextureView(v.getChildAt(it)) }
    else -> null
}

private const val ZOOM_MIN = 1f
private const val ZOOM_MAX = 5f

private fun findSurfaceView(v: View): SurfaceView? = when (v) {
    is SurfaceView -> v
    is ViewGroup -> (0 until v.childCount).firstNotNullOfOrNull { findSurfaceView(v.getChildAt(it)) }
    else -> null
}

// 이름·값은 왼쪽에 작게, 슬라이더는 가는 한 줄로 둔다
@Composable
private fun CompactSlider(label: String, value: Float, range: ClosedFloatingPointRange<Float>, colors: androidx.compose.material3.SliderColors, onChange: (Float) -> Unit) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(label, color = Tokens.HomeSub, fontSize = 11.sp, modifier = Modifier.width(84.dp))
        Slider(value = value, onValueChange = onChange, valueRange = range, colors = colors, modifier = Modifier.weight(1f).height(30.dp))
    }
}

private enum class SaveKind { SAVING, DONE, FAILED }

private class SaveStatus(val kind: SaveKind, val text: String)

private val PanelShape = RoundedCornerShape(16.dp)

// ponytail: 실내 실험이라 미니맵 범위를 5m로 둔다. 실제 앱은 NP-06(30m)과 서버의 주변 캡슐로 바꾼다
private const val MINIMAP_RANGE_M = 5f

// 미니맵: 가운데가 나, 위쪽이 내가 보는 방향. 사진이 보이는 캡슐은 동그라미, 닫힌 상자는 네모
@Composable
private fun MiniMap(capsules: List<Capsule>) {
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
private fun Pill(
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

// 캡슐의 자리를 클라우드 앵커로 저장하고 ID를 돌려준다. 실패하면 null
private suspend fun hostAnchor(session: Session, anchor: Anchor): String? = suspendCoroutine { cont ->
    try {
        session.hostCloudAnchorAsync(anchor, TTL_DAYS) { id, state ->
            cont.resume(if (state == Anchor.CloudAnchorState.SUCCESS) id else null)
        }
    } catch (e: Exception) {
        cont.resume(null)
    }
}
