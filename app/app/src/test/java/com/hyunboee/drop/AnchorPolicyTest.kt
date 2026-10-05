package com.hyunboee.drop

import com.hyunboee.drop.ar.ResolvePolicy
import com.hyunboee.drop.ar.anchorTtlDays
import com.hyunboee.drop.ar.hostRetryDelayMs
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AnchorPolicyTest {
    @Test
    fun `저장 실패는 종류에 따라 기다렸다 다시 시도하고 3번째에서 멈춘다`() {
        assertEquals(5_000L, hostRetryDelayMs("ERROR_RESOURCE_EXHAUSTED", 1))
        assertEquals(10_000L, hostRetryDelayMs("ERROR_RESOURCE_EXHAUSTED", 2))
        assertNull(hostRetryDelayMs("ERROR_RESOURCE_EXHAUSTED", 3))
        assertEquals(2_000L, hostRetryDelayMs("ERROR_HOSTING_DATASET_PROCESSING_FAILED", 1))
        assertEquals(5_000L, hostRetryDelayMs("ERROR_INTERNAL", 1))
        assertNull(hostRetryDelayMs("ERROR_NOT_AUTHORIZED", 1)) // 인증 오류는 다시 해도 같다
        assertNull(hostRetryDelayMs("TIMEOUT", 1))
    }

    @Test
    fun `찾기는 반경 밖이면 시도하지 않는다`() {
        val p = ResolvePolicy(30.0)
        assertTrue(p.shouldTry("a", 30.0, 0))
        assertFalse(p.shouldTry("a", 30.1, 0))
    }

    @Test
    fun `찾기에 실패하면 점점 오래 쉰다 15초 30초 60초 120초`() {
        val p = ResolvePolicy(30.0)
        var now = 1_000L
        for (wait in listOf(15_000L, 30_000L, 60_000L, 120_000L, 120_000L)) {
            p.onFail("a", "ERROR_RESOURCE_LOCALIZATION", now)
            assertFalse(p.shouldTry("a", 1.0, now + wait - 1))
            assertTrue(p.shouldTry("a", 1.0, now + wait))
            now += wait
        }
    }

    @Test
    fun `성공하면 쉬는 기록이 지워지고 다른 캡슐은 영향이 없다`() {
        val p = ResolvePolicy(30.0)
        p.onFail("a", "X", 0)
        assertTrue(p.shouldTry("b", 1.0, 0))
        p.onSuccess("a")
        assertTrue(p.shouldTry("a", 1.0, 0))
    }

    @Test
    fun `한도 초과가 나면 모든 캡슐 찾기를 1분 멈춘다`() {
        val p = ResolvePolicy(30.0)
        p.onFail("a", "ERROR_RESOURCE_EXHAUSTED", 0)
        assertFalse(p.shouldTry("b", 1.0, 59_999))
        assertTrue(p.shouldTry("b", 1.0, 60_000))
    }

    @Test
    fun `구글 앵커 보관 기간은 브론즈 30일 실버와 다이아 365일(키 없는 인증의 최대)이다`() {
        assertEquals(30, anchorTtlDays("BRONZE"))
        assertEquals(365, anchorTtlDays("SILVER"))
        assertEquals(365, anchorTtlDays("DIAMOND"))
    }
}
