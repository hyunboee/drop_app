package com.hyunboee.drop.api

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

const val DEFAULT_MESSAGE = "잠시 후 다시 시도해 주세요"

// 서버 에러 응답 { error: { code, message } }를 옮긴 것. status 0은 네트워크 실패
class ApiException(val code: String, message: String, val status: Int) : Exception(message)

// 모든 요청에 붙는 헤더. 앱임을 알리는 X-Client와, 로그인했으면 Bearer 토큰 (FR-N01)
fun buildHeaders(token: String?, hasBody: Boolean): Map<String, String> = buildMap {
    put("X-Client", "app")
    if (token != null) put("Authorization", "Bearer $token")
    if (hasBody) put("Content-Type", "application/json")
}

// 2xx가 아닌 응답을 ApiException으로 바꾼다. 형식이 다르면 기본 문구를 쓴다
fun parseError(status: Int, body: String): ApiException {
    val error = runCatching { JSONObject(body).optJSONObject("error") }.getOrNull()
    val code = error?.optString("code").orEmpty()
    val message = error?.optString("message").orEmpty()
    if (code.isEmpty() || message.isEmpty()) return ApiException("INTERNAL_ERROR", DEFAULT_MESSAGE, status)
    return ApiException(code, message, status)
}

class ApiClient(
    private val baseUrl: String,
    private val token: () -> String?,
    private val onAuthRequired: () -> Unit,
) {
    // 미디어 프록시의 사진(썸네일·원본)을 받는다. 실패하면 null
    // ponytail: 캐시 없이 화면에 들어올 때마다 다시 받는다. 목록이 길어지면 메모리 캐시를 둔다
    suspend fun bitmap(path: String): Bitmap? = withContext(Dispatchers.IO) {
        runCatching {
            val conn = URL(baseUrl + path).openConnection() as HttpURLConnection
            try {
                buildHeaders(token(), false).forEach { (k, v) -> conn.setRequestProperty(k, v) }
                if (conn.responseCode == 200) conn.inputStream.use { BitmapFactory.decodeStream(it) } else null
            } finally {
                conn.disconnect()
            }
        }.getOrNull()
    }

    // 발급받은 업로드 주소에 사진을 올린다. 우리 서버 경로(/로 시작)면 세션 헤더를 붙이고, S3 주소면 붙이지 않는다
    suspend fun upload(url: String, headers: Map<String, String>, bytes: ByteArray) = withContext(Dispatchers.IO) {
        val failed = ApiException("UPLOAD_FAILED", "업로드에 실패했어요", 0)
        try {
            val own = url.startsWith("/")
            val conn = URL(if (own) baseUrl + url else url).openConnection() as HttpURLConnection
            try {
                conn.requestMethod = "PUT"
                conn.doOutput = true
                if (own) buildHeaders(token(), false).forEach { (k, v) -> conn.setRequestProperty(k, v) }
                headers.forEach { (k, v) -> conn.setRequestProperty(k, v) }
                conn.outputStream.use { it.write(bytes) }
                if (conn.responseCode !in 200..299) throw failed
            } finally {
                conn.disconnect()
            }
        } catch (e: IOException) {
            throw failed
        }
    }

    // 본문이 없는 응답(204)은 null을 돌려준다
    suspend fun request(method: String, path: String, body: JSONObject? = null): JSONObject? = withContext(Dispatchers.IO) {
        val conn = try {
            (URL(baseUrl + path).openConnection() as HttpURLConnection).apply {
                requestMethod = method
                connectTimeout = 10_000
                readTimeout = 15_000
                buildHeaders(token(), body != null).forEach { (k, v) -> setRequestProperty(k, v) }
                if (body != null) {
                    doOutput = true
                    outputStream.use { it.write(body.toString().toByteArray()) }
                }
            }
        } catch (e: IOException) {
            throw ApiException("NETWORK_ERROR", "네트워크 연결을 확인해 주세요", 0)
        }
        try {
            val status = conn.responseCode
            val text = (if (status in 200..299) conn.inputStream else conn.errorStream)?.bufferedReader()?.use { it.readText() }.orEmpty()
            if (status !in 200..299) {
                val error = parseError(status, text)
                // 세션이 끝났으면 저장한 토큰을 지우고 로그인 화면으로 보낸다
                if (error.code == "AUTH_REQUIRED") withContext(Dispatchers.Main) { onAuthRequired() }
                throw error
            }
            if (text.isEmpty()) null else JSONObject(text)
        } catch (e: IOException) {
            throw ApiException("NETWORK_ERROR", "네트워크 연결을 확인해 주세요", 0)
        } finally {
            conn.disconnect()
        }
    }
}
