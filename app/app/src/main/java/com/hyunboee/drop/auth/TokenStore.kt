package com.hyunboee.drop.auth

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

// 세션 토큰을 Android Keystore의 AES-GCM 키로 암호화해 암호문만 앱 저장소에 둔다 (FR-N01, NFR-N03).
// 평문 토큰은 저장하지 않는다.
// name·alias를 달리하면 같은 방식으로 다른 값(저장해 둔 로그인 정보)도 암호화해 둘 수 있다
class TokenStore(context: Context, name: String = "auth", private val alias: String = "drop_session") {
    private val prefs = context.getSharedPreferences(name, Context.MODE_PRIVATE)

    private fun key(): SecretKey {
        val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (keyStore.getKey(alias, null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
            init(
                KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .build(),
            )
        }.generateKey()
    }

    fun save(token: String) {
        val cipher = Cipher.getInstance(TRANSFORMATION).apply { init(Cipher.ENCRYPT_MODE, key()) }
        val sealed = cipher.doFinal(token.toByteArray())
        prefs.edit()
            .putString("iv", Base64.encodeToString(cipher.iv, Base64.NO_WRAP))
            .putString("token", Base64.encodeToString(sealed, Base64.NO_WRAP))
            .apply()
    }

    // 저장된 것이 없거나 풀 수 없으면(키가 바뀜 등) null
    fun load(): String? {
        val iv = prefs.getString("iv", null) ?: return null
        val sealed = prefs.getString("token", null) ?: return null
        return runCatching {
            val cipher = Cipher.getInstance(TRANSFORMATION).apply {
                init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, Base64.decode(iv, Base64.NO_WRAP)))
            }
            String(cipher.doFinal(Base64.decode(sealed, Base64.NO_WRAP)))
        }.getOrNull()
    }

    fun clear() {
        prefs.edit().clear().apply()
    }

    private companion object {
        const val TRANSFORMATION = "AES/GCM/NoPadding"
    }
}
