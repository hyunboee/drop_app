package com.hyunboee.drop.ui

import android.graphics.Matrix
import android.graphics.SurfaceTexture
import android.media.MediaPlayer
import android.view.Surface
import android.view.TextureView
import androidx.activity.compose.BackHandler
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import com.hyunboee.drop.NP_15_INTRO_FADE_MS
import com.hyunboee.drop.NP_15_INTRO_FADE_START_MS
import com.hyunboee.drop.R
import kotlinx.coroutines.delay

// 로그인 직후 한 번 재생하는 인트로 영상(캡슐이 열리는 장면). 이 화면은 홈 화면 위에 겹쳐 놓는다.
// NP_15_INTRO_FADE_START_MS가 지나면 영상이 점점 투명해지면서 아래의 홈이 드러나고, 다 사라지면 onDone을 부른다.
// 화면을 누르거나 뒤로 가기를 누르면 바로 건너뛴다. 영상이 안 열리거나 오류가 나도 앱 진행을 막지 않는다.
// 투명도를 줄 수 있게 SurfaceView 대신 TextureView에 그린다. 영상은 화면을 꽉 채우도록 가운데를 기준으로 맞춰 자른다.
@Composable
fun IntroScreen(onDone: () -> Unit) {
    val context = LocalContext.current
    val alpha = remember { Animatable(1f) }
    val player = remember { MediaPlayer() }
    DisposableEffect(Unit) { onDispose { player.release() } }

    LaunchedEffect(Unit) {
        delay(NP_15_INTRO_FADE_START_MS)
        alpha.animateTo(0f, tween(NP_15_INTRO_FADE_MS.toInt(), easing = LinearEasing))
        onDone()
    }
    BackHandler(onBack = onDone)

    Box(
        Modifier
            .fillMaxSize()
            .graphicsLayer { this.alpha = alpha.value }
            .background(Tokens.Bg)
            .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, onClick = onDone),
    ) {
        AndroidView(
            modifier = Modifier.fillMaxSize(),
            factory = { ctx ->
                TextureView(ctx).apply {
                    surfaceTextureListener = object : TextureView.SurfaceTextureListener {
                        override fun onSurfaceTextureAvailable(st: SurfaceTexture, width: Int, height: Int) {
                            try {
                                ctx.resources.openRawResourceFd(R.raw.intro).use { player.setDataSource(it.fileDescriptor, it.startOffset, it.length) }
                                player.setSurface(Surface(st))
                                player.setOnVideoSizeChangedListener { _, vw, vh -> fillCenter(this@apply, vw, vh) }
                                player.setOnPreparedListener { it.start() }
                                player.setOnErrorListener { _, _, _ ->
                                    onDone()
                                    true
                                }
                                player.prepareAsync()
                            } catch (e: Exception) {
                                onDone()
                            }
                        }

                        override fun onSurfaceTextureSizeChanged(st: SurfaceTexture, width: Int, height: Int) {}
                        override fun onSurfaceTextureDestroyed(st: SurfaceTexture) = true
                        override fun onSurfaceTextureUpdated(st: SurfaceTexture) {}
                    }
                }
            },
        )
    }
}

// 영상 비율이 화면과 달라도 찌그러지지 않게, 화면을 꽉 채우도록 확대해 가운데를 보여 준다
private fun fillCenter(view: TextureView, videoW: Int, videoH: Int) {
    val w = view.width.toFloat()
    val h = view.height.toFloat()
    if (videoW <= 0 || videoH <= 0 || w <= 0f || h <= 0f) return
    val scale = maxOf(w / videoW, h / videoH)
    view.setTransform(Matrix().apply { setScale(videoW * scale / w, videoH * scale / h, w / 2f, h / 2f) })
}
