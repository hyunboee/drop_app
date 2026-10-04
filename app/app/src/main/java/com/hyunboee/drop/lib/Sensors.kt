package com.hyunboee.drop.lib

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.hardware.GeomagneticField
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.State
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext

fun hasLocationPermission(context: Context) =
    context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
        context.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED

// 나침반이 가리키는 북(자북)과 지도의 북(진북)의 차이(도). 한국은 약 -8°
fun declinationDeg(location: Location): Float =
    GeomagneticField(location.latitude.toFloat(), location.longitude.toFloat(), location.altitude.toFloat(), System.currentTimeMillis()).declination

// 폰이 향하는 방위(도, 자북 기준 0~360).
// upright = false: 폰을 눕혀 들었을 때 화면 위쪽이 향하는 방향 (지도)
// upright = true: 폰을 세워 들었을 때 뒷면 카메라가 보는 방향 (AR)
@Composable
fun rememberAzimuth(upright: Boolean): State<Float> {
    val context = LocalContext.current
    val azimuth = remember { mutableFloatStateOf(0f) }
    DisposableEffect(upright) {
        val manager = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
        val listener = object : SensorEventListener {
            val rotation = FloatArray(9)
            val remapped = FloatArray(9)
            val angles = FloatArray(3)

            override fun onSensorChanged(event: SensorEvent) {
                SensorManager.getRotationMatrixFromVector(rotation, event.values)
                val matrix = if (upright) {
                    SensorManager.remapCoordinateSystem(rotation, SensorManager.AXIS_X, SensorManager.AXIS_Z, remapped)
                    remapped
                } else {
                    rotation
                }
                SensorManager.getOrientation(matrix, angles)
                azimuth.floatValue = (Math.toDegrees(angles[0].toDouble()).toFloat() + 360f) % 360f
            }

            override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
        }
        manager.registerListener(listener, manager.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR), SensorManager.SENSOR_DELAY_UI)
        onDispose { manager.unregisterListener(listener) }
    }
    return azimuth
}

// 현재 위치. 권한이 없거나 아직 못 잡았으면 null
@SuppressLint("MissingPermission") // 아래에서 hasLocationPermission으로 확인한다
@Composable
fun rememberLocation(granted: Boolean = hasLocationPermission(LocalContext.current)): State<Location?> {
    val context = LocalContext.current
    val location = remember { mutableStateOf<Location?>(null) }
    DisposableEffect(granted) {
        if (!hasLocationPermission(context)) return@DisposableEffect onDispose {}
        val manager = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
        // 정확도가 더 좋은 값만 받아들이되, 5초가 지난 값은 새 값으로 바꾼다
        val listener = LocationListener { next ->
            val old = location.value
            if (old == null || next.accuracy <= old.accuracy || next.time - old.time > 5_000) location.value = next
        }
        val providers = listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER).filter { manager.isProviderEnabled(it) }
        location.value = providers.mapNotNull { manager.getLastKnownLocation(it) }.minByOrNull { it.accuracy }
        providers.forEach { manager.requestLocationUpdates(it, 1_000L, 0f, listener) }
        onDispose { manager.removeUpdates(listener) }
    }
    return location
}
