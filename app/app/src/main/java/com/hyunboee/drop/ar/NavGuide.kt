package com.hyunboee.drop.ar

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.hyunboee.drop.NP_11_NAV_ARRIVE_M
import com.hyunboee.drop.NP_13_NAV_ANCHOR_ARRIVE_M
import com.hyunboee.drop.NP_14_NAV_SCAN_HINT_M
import com.hyunboee.drop.lib.bearingDeg
import com.hyunboee.drop.lib.declinationDeg
import com.hyunboee.drop.lib.distanceM
import com.hyunboee.drop.lib.relativeDeg
import com.hyunboee.drop.lib.rememberAzimuth
import com.hyunboee.drop.lib.rememberLocation
import com.hyunboee.drop.ui.MapPin
import com.hyunboee.drop.ui.Tokens

// AR 길찾기: 목표 캡슐까지 남은 거리를 띄우고, 3D 화살표가 가리킬 방향을 계산해 AR 화면에 넘긴다.
// onTurn: 내가 보는 방향 기준 목표 쪽(도, +는 오른쪽). 위치를 모르거나 도착했으면 null(화살표 숨김).
// 방향은 내 위치(GPS)와 폰이 보는 방향(나침반)으로 구한다
@Composable
fun NavGuide(target: MapPin, anchorDist: Float?, onTurn: (Float?) -> Unit, onStop: () -> Unit, onMap: () -> Unit, modifier: Modifier = Modifier) {
    val location by rememberLocation()
    val azimuth by rememberAzimuth(upright = true)
    val here = location
    val dist = here?.let { distanceM(it.latitude, it.longitude, target.lat, target.lng) }
    // AR로 캡슐 자리를 찾았으면 화살표는 SpikeScreen이 AR 위치로 가리키므로 GPS 방향은 보내지 않는다
    val turn = if (anchorDist != null || here == null || dist == null || dist <= NP_11_NAV_ARRIVE_M) {
        null
    } else {
        relativeDeg(bearingDeg(here.latitude, here.longitude, target.lat, target.lng), (azimuth + declinationDeg(here)).toDouble()).toFloat()
    }
    SideEffect { onTurn(turn) }

    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Label(
            when {
                // AR이 캡슐의 자리를 찾은 뒤: GPS가 아니라 AR 위치로 안내한다
                anchorDist != null && anchorDist <= NP_13_NAV_ANCHOR_ARRIVE_M -> "도착했어요 · '${target.title}'이(가) 바로 앞에 있어요"
                anchorDist != null -> "'${target.title}'까지 ${"%.1f".format(anchorDist)}m (AR로 정확히 찾았어요)"
                dist == null -> "현재 위치를 찾는 중이에요…"
                dist <= NP_11_NAV_ARRIVE_M -> "도착했어요 · 주변을 비춰 '${target.title}'을(를) 찾아보세요"
                else -> "'${target.title}'까지 ${if (dist >= 1000) "%.1fkm".format(dist / 1000) else "${dist.toInt()}m"}" +
                    " · GPS 오차 약 ${here.accuracy.toInt()}m" +
                    (if (dist <= NP_14_NAV_SCAN_HINT_M) "\n가까워요. 캡슐이 있던 곳을 비춰 보세요" else "")
            },
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            for ((label, action) in listOf("‹ 지도로" to onMap, "길찾기 끝내기" to onStop)) {
                Text(
                    label,
                    color = Tokens.HomeSub,
                    fontSize = 12.sp,
                    modifier = Modifier.clip(RoundedCornerShape(50)).background(Tokens.Surface).clickable(onClick = action).padding(horizontal = 12.dp, vertical = 8.dp),
                )
            }
        }
    }
}

@Composable
private fun Label(text: String) {
    Text(
        text,
        color = Tokens.HomeText,
        fontSize = 14.sp,
        fontWeight = FontWeight.Bold,
        modifier = Modifier.clip(RoundedCornerShape(16.dp)).background(Tokens.Surface).padding(horizontal = 14.dp, vertical = 10.dp),
    )
}
