package com.hyunboee.drop.ar

import com.google.ar.core.Anchor
import com.google.ar.core.Pose
import com.google.ar.core.Session
import com.hyunboee.drop.NP_04_SCAN_WAIT_MS
import com.hyunboee.drop.NP_05_HOST_TIMEOUT_MS
import kotlinx.coroutines.delay
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull
import kotlin.coroutines.resume

// 구글 클라우드 앵커 저장·찾기. 한도(저장 분당 30건, 찾기 분당 300건, IP·프로젝트 기준)를 넘기지 않고
// 실패했을 때 알맞게 다시 시도하도록 정책을 한 곳에 둔다.

internal const val MAX_HOST_ATTEMPTS = 3

// 저장(host)이 실패했을 때 다시 시도하기 전에 기다릴 시간(ms). null이면 다시 시도해도 소용없는 실패다.
// attempt는 지금까지 시도한 횟수(첫 실패 직후는 1)
internal fun hostRetryDelayMs(stateName: String, attempt: Int): Long? {
    if (attempt >= MAX_HOST_ATTEMPTS) return null
    return when (stateName) {
        // 한도 초과·서버 문제: 점점 길게 기다린다 (5초, 10초)
        "ERROR_RESOURCE_EXHAUSTED", "ERROR_SERVICE_UNAVAILABLE", "ERROR_HOSTING_SERVICE_UNAVAILABLE", "ERROR_INTERNAL" -> 5_000L shl (attempt - 1)
        // 주변 모습이 부족했다: 조금 더 비추게 하고 다시 시도한다
        "ERROR_HOSTING_DATASET_PROCESSING_FAILED" -> 2_000L
        // 인증 오류 등은 다시 해도 같다
        else -> null
    }
}

internal fun hostFailureText(stateName: String) = when (stateName) {
    "ERROR_RESOURCE_EXHAUSTED" -> "저장 요청이 한꺼번에 몰렸어요. 잠시 뒤 다시 놓아 주세요"
    "ERROR_NOT_AUTHORIZED" -> "구글 인증이 되지 않았어요. 앱 설치 방식을 확인해야 해요"
    "ERROR_HOSTING_DATASET_PROCESSING_FAILED" -> "주변 모습을 충분히 담지 못했어요. 천천히 더 비추고 다시 놓아 주세요"
    "TIMEOUT" -> "시간이 오래 걸려 중단했어요"
    else -> "구글 서버에 저장하지 못했어요 ($stateName)"
}

// 캡슐의 자리를 찾을 때의 정책. 실패한 캡슐은 점점 느리게 다시 시도하고, 한도 초과가 나면 잠시 모두 멈춘다
internal class ResolvePolicy(private val rangeM: Double) {
    private val failures = HashMap<String, Int>()
    private val nextAt = HashMap<String, Long>()
    private var coolUntil = 0L

    // 지금 이 캡슐의 자리를 찾아 봐도 되는가: 반경 안이고, 쉬는 시간이 끝났고, 한도 초과로 멈춘 중이 아닐 때
    fun shouldTry(id: String, distM: Double, nowMs: Long) = distM <= rangeM && nowMs >= coolUntil && nowMs >= (nextAt[id] ?: 0L)

    fun onFail(id: String, stateName: String, nowMs: Long) {
        val count = (failures[id] ?: 0) + 1
        failures[id] = count
        // 15초, 30초, 60초, 120초(최대)
        nextAt[id] = nowMs + minOf(15_000L shl (count - 1).coerceAtMost(3), 120_000L)
        if (stateName == "ERROR_RESOURCE_EXHAUSTED") coolUntil = nowMs + 60_000L
    }

    fun onSuccess(id: String) {
        failures.remove(id)
        nextAt.remove(id)
    }
}

internal sealed class HostResult {
    class Ok(val id: String) : HostResult()
    class Failed(val reason: String) : HostResult()
}

private class HostOutcome(val id: String?, val state: String)

private suspend fun hostOnce(session: Session, anchor: Anchor, ttlDays: Int): HostOutcome = suspendCancellableCoroutine { cont ->
    try {
        session.hostCloudAnchorAsync(anchor, ttlDays) { id, state ->
            if (cont.isActive) cont.resume(HostOutcome(if (state == Anchor.CloudAnchorState.SUCCESS) id else null, state.name))
        }
    } catch (e: Exception) {
        cont.resume(HostOutcome(null, "ERROR_INTERNAL"))
    }
}

// 캡슐의 자리를 구글에 저장하고 ID를 돌려준다.
// 1) 스캔 품질이 "충분"해질 때까지 최대 NP-04 기다리며 더 비추게 안내하고 2) 저장하고 3) 실패 종류에 따라 최대 3번 다시 시도한다
internal suspend fun hostAnchor(
    session: Session,
    anchor: Anchor,
    ttlDays: Int,
    cameraPose: () -> Pose?,
    onStatus: (String) -> Unit,
): HostResult {
    val start = System.currentTimeMillis()
    while (true) {
        val quality = cameraPose()?.let { runCatching { session.estimateFeatureMapQualityForHosting(it) }.getOrNull() }
        if (quality == Session.FeatureMapQuality.SUFFICIENT || quality == Session.FeatureMapQuality.GOOD) break
        if (System.currentTimeMillis() - start >= NP_04_SCAN_WAIT_MS) break
        onStatus("주변을 천천히 더 비춰 주세요 (스캔 품질: ${quality?.name ?: "확인 중"})")
        delay(500)
    }
    var attempt = 0
    while (true) {
        attempt += 1
        onStatus(if (attempt == 1) "자리를 저장하는 중… 캡슐을 계속 비춰 주세요" else "자리 저장을 다시 시도해요 ($attempt/$MAX_HOST_ATTEMPTS)…")
        val outcome = withTimeoutOrNull(NP_05_HOST_TIMEOUT_MS) { hostOnce(session, anchor, ttlDays) } ?: HostOutcome(null, "TIMEOUT")
        if (outcome.id != null) return HostResult.Ok(outcome.id)
        val wait = hostRetryDelayMs(outcome.state, attempt) ?: return HostResult.Failed(hostFailureText(outcome.state))
        onStatus("${hostFailureText(outcome.state)} — 잠시 뒤 다시 시도해요")
        delay(wait)
    }
}
