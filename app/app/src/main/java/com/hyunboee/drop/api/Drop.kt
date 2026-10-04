package com.hyunboee.drop.api

import android.graphics.Bitmap
import com.hyunboee.drop.M_07_THUMB_LONG_SIDE_PX
import org.json.JSONObject
import java.io.ByteArrayOutputStream

private fun jpeg(bitmap: Bitmap): ByteArray = ByteArrayOutputStream().also { bitmap.compress(Bitmap.CompressFormat.JPEG, 90, it) }.toByteArray()

private fun thumb(bitmap: Bitmap): Bitmap {
    val scale = M_07_THUMB_LONG_SIDE_PX.toFloat() / maxOf(bitmap.width, bitmap.height)
    return if (scale >= 1f) bitmap else Bitmap.createScaledBitmap(bitmap, (bitmap.width * scale).toInt().coerceAtLeast(1), (bitmap.height * scale).toInt().coerceAtLeast(1), true)
}

private fun JSONObject.headers(): Map<String, String> = getJSONObject("headers").let { h -> h.keys().asSequence().associateWith { h.getString(it) } }

// 드롭: 업로드 주소 발급 → 원본·썸네일 올리기 → 게시 (FR-N04, FR-N06). 새 캡슐의 ID를 돌려준다.
// heading은 0~359의 정수로 보낸다. grade는 BRONZE 또는 SILVER (실버는 결제 없이 저장되는 실험)
suspend fun publishCapsule(api: ApiClient, bitmap: Bitmap, title: String, lat: Double, lng: Double, accuracy: Float, headingDeg: Float, cloudAnchorId: String?, sizeM: Float, grade: String): String {
    val urls = api.request("POST", "/api/uploads")!!
    for ((key, image) in listOf("original" to bitmap, "thumb" to thumb(bitmap))) {
        val target = urls.getJSONObject(key)
        api.upload(target.getString("url"), target.headers(), jpeg(image))
    }
    val body = JSONObject()
        .put("media_id", urls.getString("media_id"))
        .put("title", title)
        .put("grade", grade)
        .put("lat", lat)
        .put("lng", lng)
        .put("accuracy", accuracy.toDouble())
        .put("heading", ((Math.round(headingDeg) % 360) + 360) % 360)
        .put("user_lat", lat)
        .put("user_lng", lng)
        .put("size_m", sizeM.toDouble())
        .apply { if (cloudAnchorId != null) put("cloud_anchor_id", cloudAnchorId) }
    return api.request("POST", "/api/capsules", body)!!.getString("id")
}
