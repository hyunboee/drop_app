package com.hyunboee.drop

import com.hyunboee.drop.api.DEFAULT_MESSAGE
import com.hyunboee.drop.api.buildHeaders
import com.hyunboee.drop.api.parseError
import com.hyunboee.drop.lib.bearingDeg
import com.hyunboee.drop.lib.canSignup
import com.hyunboee.drop.lib.distanceM
import com.hyunboee.drop.lib.relativeDeg
import com.hyunboee.drop.lib.daysLeft
import com.hyunboee.drop.lib.displayName
import com.hyunboee.drop.lib.isValidEmail
import com.hyunboee.drop.lib.isValidPassword
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AuthLogicTest {
    @Test
    fun `APP-02 M-10 비밀번호는 8자부터 통과한다`() {
        assertFalse(isValidPassword("a".repeat(M_10_PASSWORD_MIN_LENGTH - 1)))
        assertTrue(isValidPassword("a".repeat(M_10_PASSWORD_MIN_LENGTH)))
    }

    @Test
    fun `APP-02 FR-01 이메일 형식을 서버와 같은 식으로 본다`() {
        assertTrue(isValidEmail("you@example.com"))
        for (bad in listOf("", "you", "you@", "@example.com", "you@example", "you @example.com", "a@b@c.com")) {
            assertFalse(bad, isValidEmail(bad))
        }
    }

    @Test
    fun `APP-02 FR-01 필수 동의 3개 중 하나라도 빠지면 가입할 수 없다`() {
        assertTrue(canSignup("you@example.com", "password1", terms = true, location = true, age = true))
        assertFalse(canSignup("you@example.com", "password1", terms = false, location = true, age = true))
        assertFalse(canSignup("you@example.com", "password1", terms = true, location = false, age = true))
        assertFalse(canSignup("you@example.com", "password1", terms = true, location = true, age = false))
        assertFalse(canSignup("you@example", "password1", terms = true, location = true, age = true))
        assertFalse(canSignup("you@example.com", "short", terms = true, location = true, age = true))
    }

    @Test
    fun `NW-16 남은 날은 올림하고 지났으면 0이다`() {
        val now = 1_800_000_000_000L // 2027-01-15T08:00:00.000Z
        assertEquals(1, daysLeft("2027-01-15T08:00:01.000Z", now))
        assertEquals(1, daysLeft("2027-01-16T08:00:00.000Z", now))
        assertEquals(2, daysLeft("2027-01-16T08:00:00.001Z", now))
        assertEquals(30, daysLeft("2027-02-14T08:00:00.000Z", now))
        assertEquals(0, daysLeft("2027-01-15T07:59:59.000Z", now))
        assertEquals("hyunboee", displayName("hyunboee@example.com"))
    }

    @Test
    fun `NW-19 방위와 거리, 내가 보는 방향 기준 목표 쪽을 계산한다`() {
        assertEquals(0.0, bearingDeg(37.0, 127.0, 38.0, 127.0), 0.01)
        assertEquals(180.0, bearingDeg(38.0, 127.0, 37.0, 127.0), 0.01)
        assertEquals(90.0, bearingDeg(0.0, 127.0, 0.0, 128.0), 0.01)
        assertEquals(270.0, bearingDeg(0.0, 128.0, 0.0, 127.0), 0.01)
        assertEquals(111_195.0, distanceM(37.0, 127.0, 38.0, 127.0), 5.0)
        assertEquals(0.0, distanceM(37.5, 127.0, 37.5, 127.0), 0.001)
        assertEquals(90.0, relativeDeg(90.0, 0.0), 0.001) // 목표가 동쪽, 나는 북쪽을 봄 → 오른쪽
        assertEquals(-20.0, relativeDeg(350.0, 10.0), 0.001) // 0°를 넘어가도 가까운 쪽으로
        assertEquals(20.0, relativeDeg(10.0, 350.0), 0.001)
    }

    @Test
    fun `APP-01 FR-N01 모든 요청에 X-Client app을 붙이고 토큰이 있으면 Bearer를 붙인다`() {
        assertEquals(mapOf("X-Client" to "app"), buildHeaders(null, hasBody = false))
        assertEquals(
            mapOf("X-Client" to "app", "Authorization" to "Bearer tok", "Content-Type" to "application/json"),
            buildHeaders("tok", hasBody = true),
        )
    }

    @Test
    fun `APP-01 서버 에러 응답의 code와 message를 그대로 옮긴다`() {
        val e = parseError(401, """{"error":{"code":"INVALID_CREDENTIALS","message":"이메일 또는 비밀번호가 맞지 않아요"}}""")
        assertEquals("INVALID_CREDENTIALS", e.code)
        assertEquals("이메일 또는 비밀번호가 맞지 않아요", e.message)
        assertEquals(401, e.status)
    }

    @Test
    fun `APP-01 형식이 다른 에러 응답은 기본 문구로 바꾼다`() {
        for (body in listOf("", "<html>", "{}", """{"error":{"code":"X"}}""", """{"error":"oops"}""")) {
            val e = parseError(500, body)
            assertEquals("INTERNAL_ERROR", e.code)
            assertEquals(DEFAULT_MESSAGE, e.message)
        }
    }
}
