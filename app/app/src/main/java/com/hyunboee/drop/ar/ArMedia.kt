package com.hyunboee.drop.ar

import android.content.ContentValues
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Paint
import android.media.ExifInterface
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import android.util.Log

internal const val TAG = "DropAr"

// 사진을 고르기 전에 쓰는 기본 그림
internal fun placeholderBitmap(): Bitmap {
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
internal fun decodeUpright(context: Context, uri: Uri): Bitmap? {
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
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return false // Android 10 미만은 저장 권한이 따로 필요해 다루지 않는다
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
