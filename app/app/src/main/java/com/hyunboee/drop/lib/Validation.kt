package com.hyunboee.drop.lib

import com.hyunboee.drop.M_10_PASSWORD_MIN_LENGTH

// 서버 routes/auth.js의 EMAIL_RE와 같은 식
private val EMAIL_RE = Regex("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$")

fun isValidEmail(email: String): Boolean = EMAIL_RE.matches(email)

fun isValidPassword(password: String): Boolean = password.length >= M_10_PASSWORD_MIN_LENGTH

// 가입 버튼을 누를 수 있는 조건: 이메일 형식, 비밀번호 길이(M-10), 필수 동의 3개 (FR-01)
fun canSignup(email: String, password: String, terms: Boolean, location: Boolean, age: Boolean): Boolean =
    isValidEmail(email) && isValidPassword(password) && terms && location && age

// 서버가 주는 만료 시각(ISO 8601, UTC)까지 남은 날. 하루가 안 남아도 1(D-1), 지났으면 0
fun daysLeft(expiresAt: String, nowMs: Long): Int {
    val format = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.US)
    format.timeZone = java.util.TimeZone.getTimeZone("UTC")
    val leftMs = (format.parse(expiresAt)?.time ?: return 0) - nowMs
    return if (leftMs <= 0) 0 else ((leftMs + 86_399_999) / 86_400_000).toInt()
}

// 이메일의 @ 앞부분을 화면에 보이는 사용자 이름으로 쓴다
fun displayName(email: String): String = email.substringBefore('@')
