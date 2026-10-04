package com.hyunboee.drop.lib

import kotlin.math.asin
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt

private const val EARTH_RADIUS_M = 6_371_008.8

// 두 좌표 사이의 거리(m). 서버 lib/geo.js와 같은 하버사인 식
fun distanceM(lat1: Double, lng1: Double, lat2: Double, lng2: Double): Double {
    val p1 = Math.toRadians(lat1)
    val p2 = Math.toRadians(lat2)
    val a = sin((p2 - p1) / 2).pow(2) + cos(p1) * cos(p2) * sin(Math.toRadians(lng2 - lng1) / 2).pow(2)
    return 2 * EARTH_RADIUS_M * asin(minOf(1.0, sqrt(a)))
}

// 첫 좌표에서 둘째 좌표를 바라보는 방위(도). 북 0, 동 90, 남 180, 서 270
fun bearingDeg(lat1: Double, lng1: Double, lat2: Double, lng2: Double): Double {
    val p1 = Math.toRadians(lat1)
    val p2 = Math.toRadians(lat2)
    val dl = Math.toRadians(lng2 - lng1)
    val deg = Math.toDegrees(atan2(sin(dl) * cos(p2), cos(p1) * sin(p2) - sin(p1) * cos(p2) * cos(dl)))
    return (deg + 360) % 360
}

// 내가 보는 방향(heading)을 기준으로 목표가 어느 쪽인지. 0은 정면, +는 오른쪽, -는 왼쪽 (-180 ~ 180)
fun relativeDeg(bearing: Double, heading: Double): Double = ((bearing - heading + 540) % 360) - 180
