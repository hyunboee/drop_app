package com.hyunboee.drop.ui

import android.Manifest
import android.content.Context
import android.content.res.Resources
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Point
import android.graphics.RectF
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import com.hyunboee.drop.NP_10_MAP_START_RADIUS_M
import com.hyunboee.drop.lib.declinationDeg
import com.hyunboee.drop.lib.hasLocationPermission
import com.hyunboee.drop.lib.rememberAzimuth
import org.osmdroid.config.Configuration
import org.osmdroid.tileprovider.tilesource.TileSourceFactory
import org.osmdroid.util.BoundingBox
import org.osmdroid.util.GeoPoint
import org.osmdroid.views.CustomZoomButtonsController
import org.osmdroid.views.MapView
import org.osmdroid.views.Projection
import org.osmdroid.views.overlay.Marker
import org.osmdroid.views.overlay.Overlay
import org.osmdroid.views.overlay.mylocation.GpsMyLocationProvider
import org.osmdroid.views.overlay.mylocation.MyLocationNewOverlay
import kotlin.math.cos

class MapPin(val id: String, val title: String, val lat: Double, val lng: Double)

// 가운데에서 사방으로 radiusM만큼 보이는 범위
private fun around(center: GeoPoint, radiusM: Double): BoundingBox {
    val dLat = radiusM / 111_320.0
    val dLng = dLat / cos(Math.toRadians(center.latitude))
    return BoundingBox(center.latitude + dLat, center.longitude + dLng, center.latitude - dLat, center.longitude - dLng)
}

// 내 위치에서 내가 보는 방향으로 퍼지는 부채꼴을 그린다
private class HeadingOverlay(private val me: MyLocationNewOverlay, private val heading: FloatArray) : Overlay() {
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0x66E2A346 }
    private val point = Point()

    override fun draw(canvas: Canvas, projection: Projection) {
        val here = me.myLocation ?: return
        projection.toPixels(here, point)
        val r = 70f * Resources.getSystem().displayMetrics.density
        // drawArc의 0°는 오른쪽(동)이므로 북 기준 방위에서 90°를 뺀다
        canvas.drawArc(RectF(point.x - r, point.y - r, point.x + r, point.y + r), heading[0] - 90f - 30f, 60f, true, paint)
    }
}

// NW-19 내 캡슐 지도: 세계 지도 위에 내가 놓은 캡슐의 자리를 보여 준다.
// 처음에는 현재 위치 둘레 NP-10만 보이고, 두 손가락으로 넓히거나 좁힌다
@Composable
fun MapScreen(pins: List<MapPin>, onBack: () -> Unit, onNavigate: (MapPin) -> Unit) {
    val context = LocalContext.current
    val azimuth by rememberAzimuth(upright = false)
    val heading = remember { FloatArray(1) } // 지도 뷰가 그릴 때 읽는 값 (진북 기준)
    var picked by remember { mutableStateOf<MapPin?>(null) }
    var granted by remember { mutableStateOf(hasLocationPermission(context)) }
    val ask = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { result -> granted = result.values.any { it } }
    LaunchedEffect(Unit) {
        if (!granted) ask.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION))
    }

    Box(Modifier.fillMaxSize().background(Tokens.HomeBg)) {
        // 위치 권한을 받으면 지도를 다시 만들어 현재 위치를 붙인다
        key(granted, pins.size) {
            AndroidView(
                modifier = Modifier.fillMaxSize(),
                factory = { ctx ->
                    // 타일 캐시 위치와 User-Agent(앱 패키지 이름)를 정한다. OSM 타일 서버는 User-Agent가 있어야 한다
                    Configuration.getInstance().load(ctx, ctx.getSharedPreferences("osmdroid", Context.MODE_PRIVATE))
                    MapView(ctx).apply {
                        setTileSource(TileSourceFactory.MAPNIK)
                        setMultiTouchControls(true)
                        zoomController.setVisibility(CustomZoomButtonsController.Visibility.NEVER)
                        isTilesScaledToDpi = true
                        minZoomLevel = 3.0 // 세계 전체
                        isVerticalMapRepetitionEnabled = false
                        for (pin in pins) {
                            overlays.add(
                                Marker(this).apply {
                                    position = GeoPoint(pin.lat, pin.lng)
                                    title = pin.title
                                    setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_BOTTOM)
                                    // 표식을 누르면 제목을 띄우고 그 캡슐을 길찾기 목표로 고른다
                                    setOnMarkerClickListener { marker, _ ->
                                        marker.showInfoWindow()
                                        picked = pin
                                        true
                                    }
                                },
                            )
                        }
                        // 현재 위치를 알기 전: 최근에 놓은 캡슐 둘레, 캡슐도 없으면 세계 전체
                        val first = pins.firstOrNull()
                        if (first == null) controller.setZoom(3.0) else post { zoomToBoundingBox(around(GeoPoint(first.lat, first.lng), NP_10_MAP_START_RADIUS_M), false) }
                        if (granted) {
                            val me = MyLocationNewOverlay(GpsMyLocationProvider(ctx), this)
                            me.enableMyLocation()
                            me.runOnFirstFix { post { me.myLocation?.let { zoomToBoundingBox(around(it, NP_10_MAP_START_RADIUS_M), true) } } }
                            overlays.add(HeadingOverlay(me, heading))
                            overlays.add(me)
                        }
                        onResume()
                    }
                },
                update = { map ->
                    // 폰이 향하는 방향이 바뀔 때마다 다시 그린다. 자북과 진북의 차이를 보정한다
                    val here = map.overlays.filterIsInstance<MyLocationNewOverlay>().firstOrNull()?.lastFix
                    heading[0] = azimuth + (here?.let { declinationDeg(it) } ?: 0f)
                    map.invalidate()
                },
                onRelease = { map ->
                    map.overlays.filterIsInstance<MyLocationNewOverlay>().forEach { it.disableMyLocation() }
                    map.onPause()
                    map.onDetach()
                },
            )
        }

        Row(Modifier.safeDrawingPadding().padding(16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(
                "‹ 홈",
                color = Tokens.HomeText,
                fontSize = 14.sp,
                modifier = Modifier.clip(RoundedCornerShape(50)).background(Tokens.Surface).clickable(onClick = onBack).padding(horizontal = 16.dp, vertical = 11.dp),
            )
            Text(
                if (granted) "내가 놓은 캡슐 ${pins.size}개" else "내가 놓은 캡슐 ${pins.size}개 · 위치 권한이 없어 현재 위치는 보이지 않아요",
                color = Tokens.HomeText,
                fontSize = 13.sp,
                modifier = Modifier.clip(RoundedCornerShape(16.dp)).background(Tokens.Surface).padding(horizontal = 14.dp, vertical = 10.dp),
            )
        }
        // 표식을 고르면 그 캡슐까지 AR로 안내하는 버튼이 뜬다
        picked?.let { pin ->
            Text(
                "'${pin.title}' AR 길찾기",
                color = Tokens.TextOnGold,
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center,
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .safeDrawingPadding()
                    .padding(horizontal = 20.dp, vertical = 28.dp)
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(16.dp))
                    .background(Tokens.Amber)
                    .clickable { onNavigate(pin) }
                    .padding(vertical = 18.dp),
            )
        }
        // OpenStreetMap 이용 조건: 출처 표시
        Text(
            "© OpenStreetMap contributors",
            color = Color.Black,
            fontSize = 10.sp,
            modifier = Modifier.align(Alignment.BottomEnd).safeDrawingPadding().background(Color.White.copy(alpha = 0.7f)).padding(horizontal = 6.dp, vertical = 2.dp),
        )
    }
}
