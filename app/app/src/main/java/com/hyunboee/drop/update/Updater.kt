package com.hyunboee.drop.update

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import androidx.core.content.FileProvider
import com.hyunboee.drop.BuildConfig
import com.hyunboee.drop.api.ApiClient
import com.hyunboee.drop.api.ApiException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.security.MessageDigest

class UpdateInfo(val versionCode: Int, val versionName: String, val notes: String, val sha256: String, val size: Long)

// 앱 자체 업데이트(밖 앱): 서버에 올려 둔 새 버전이 지금 앱보다 높으면 받아서 설치 화면으로 넘긴다.
// 안드로이드 규칙상 마지막 "설치" 버튼은 사용자가 직접 눌러야 한다
class Updater(private val context: Context, private val api: ApiClient) {
    // 서버의 최신 버전 정보. 올려 둔 것이 없거나 접속하지 못하면 null
    suspend fun latest(): UpdateInfo? {
        val j = try {
            api.request("GET", "/api/app/latest")
        } catch (e: ApiException) {
            return null
        } ?: return null
        return UpdateInfo(j.getInt("version_code"), j.getString("version_name"), j.optString("notes"), j.getString("sha256"), j.getLong("size"))
    }

    fun isNewer(info: UpdateInfo) = info.versionCode > BuildConfig.VERSION_CODE

    private val file get() = File(context.cacheDir, "updates/drop-update.apk")

    // 설치 파일을 받아 sha256이 맞는지 확인한다. 안 맞으면 지우고 실패시킨다
    suspend fun download(info: UpdateInfo, onProgress: (Int) -> Unit): File {
        api.download("/api/app/download", file, onProgress)
        val ok = withContext(Dispatchers.IO) {
            val md = MessageDigest.getInstance("SHA-256")
            file.inputStream().use { input ->
                val buf = ByteArray(64 * 1024)
                while (true) {
                    val n = input.read(buf)
                    if (n < 0) break
                    md.update(buf, 0, n)
                }
            }
            md.digest().joinToString("") { "%02x".format(it) } == info.sha256
        }
        if (!ok) {
            file.delete()
            throw ApiException("DOWNLOAD_CORRUPT", "받은 파일이 올바르지 않아요. 다시 시도해 주세요", 0)
        }
        return file
    }

    // "출처를 알 수 없는 앱 설치"를 이 앱에 허용했는지
    fun canInstall() = context.packageManager.canRequestPackageInstalls()

    // 허용 설정 화면을 연다. 허용하고 돌아와서 다시 누르게 안내한다
    fun openInstallSettings() {
        context.startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${context.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    fun install(apk: File) {
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.files", apk)
        context.startActivity(
            Intent(Intent.ACTION_VIEW)
                .setDataAndType(uri, "application/vnd.android.package-archive")
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK),
        )
    }
}
