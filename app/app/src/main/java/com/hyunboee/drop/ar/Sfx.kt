package com.hyunboee.drop.ar

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import kotlin.math.PI
import kotlin.math.exp
import kotlin.math.pow
import kotlin.math.sin
import kotlin.random.Random

// 캡슐 효과음. 파일 없이 코드로 만든 소리를 AudioTrack으로 낸다.
// RISE: 솟아오를 때 올라가는 울림, LOWER: 내려갈 때 내려가는 울림, OPEN: 바람 소리 뒤에 맑은 종소리 네 음
enum class SfxKind { RISE, LOWER, OPEN }

private const val RATE = 22_050

private fun samples(seconds: Float, f: (t: Float) -> Float): ShortArray =
    ShortArray((seconds * RATE).toInt()) { i -> (f(i.toFloat() / RATE).coerceIn(-1f, 1f) * 0.6f * Short.MAX_VALUE).toInt().toShort() }

// 처음과 끝이 부드럽게 커지고 작아지는 모양(0~1)
private fun fade(t: Float, d: Float) = sin(PI.toFloat() * (t / d)).pow(2)

// from → to Hz로 부드럽게 변하는 소리. 위상은 주파수를 적분해서 구한다
private fun sweep(seconds: Float, from: Float, to: Float): ShortArray {
    var phase = 0f
    return samples(seconds) { t ->
        val freq = from * (to / from).pow(t / seconds)
        phase += (2 * PI.toFloat() * freq) / RATE
        val tone = sin(phase) + 0.3f * sin(2 * phase) + 0.12f * sin(3 * phase)
        val rumble = 0.25f * sin(2 * PI.toFloat() * 55f * t)
        (tone * 0.5f + rumble) * fade(t, seconds)
    }
}

private fun open(): ShortArray {
    val notes = floatArrayOf(523.25f, 659.25f, 783.99f, 1046.5f) // 도 미 솔 높은 도
    val rnd = Random(7)
    return samples(1.5f) { t ->
        // 열리는 순간의 바람 소리: 잡음이 빠르게 잦아든다
        val whoosh = (rnd.nextFloat() * 2 - 1) * 0.25f * exp(-t * 9f)
        var bell = 0f
        for ((i, f) in notes.withIndex()) {
            val s = t - (0.10f + i * 0.09f)
            if (s < 0) continue
            val decay = exp(-s * 4.5f)
            bell += decay * (sin(2 * PI.toFloat() * f * s) + 0.30f * sin(2 * PI.toFloat() * f * 2f * s) + 0.10f * sin(2 * PI.toFloat() * f * 3.01f * s))
        }
        whoosh + bell * 0.3f
    }
}

class Sfx {
    private val tracks: Map<SfxKind, AudioTrack> = mapOf(
        SfxKind.RISE to track(sweep(0.9f, 180f, 420f)),
        SfxKind.LOWER to track(sweep(0.7f, 400f, 170f)),
        SfxKind.OPEN to track(open()),
    )
    private var lastAt = 0L

    private fun track(data: ShortArray): AudioTrack {
        val t = AudioTrack.Builder()
            .setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_GAME).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
            .setAudioFormat(AudioFormat.Builder().setSampleRate(RATE).setEncoding(AudioFormat.ENCODING_PCM_16BIT).setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build())
            .setTransferMode(AudioTrack.MODE_STATIC)
            .setBufferSizeInBytes(data.size * 2)
            .build()
        t.write(data, 0, data.size)
        return t
    }

    // 여러 캡슐이 한꺼번에 변해도 소리가 겹쳐 시끄럽지 않게, 0.25초 안의 새 소리는 무시한다
    fun play(kind: SfxKind) {
        val now = System.currentTimeMillis()
        if (now - lastAt < 250) return
        lastAt = now
        val t = tracks.getValue(kind)
        try {
            t.stop()
            t.reloadStaticData()
            t.play()
        } catch (e: IllegalStateException) {
            // 소리가 안 나도 화면 동작은 계속된다
        }
    }

    fun release() = tracks.values.forEach { it.release() }
}
