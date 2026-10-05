package com.hyunboee.drop.auth

import android.content.Context
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.NoCredentialException
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.hyunboee.drop.GOOGLE_WEB_CLIENT_ID

sealed class GoogleResult {
    class Token(val idToken: String) : GoogleResult()
    object Cancelled : GoogleResult() // 사용자가 계정 선택 창을 닫았다
    class Failed(val message: String) : GoogleResult()
}

// 폰에 로그인된 구글 계정을 고르는 창(Google로 로그인)을 띄우고, 고른 계정의 ID 토큰을 받는다.
// context는 화면(Activity)이어야 한다. 서버가 이 토큰을 구글에 확인해 로그인시킨다
suspend fun googleIdToken(context: Context): GoogleResult {
    val request = GetCredentialRequest.Builder().addCredentialOption(GetSignInWithGoogleOption.Builder(GOOGLE_WEB_CLIENT_ID).build()).build()
    return try {
        val credential = CredentialManager.create(context).getCredential(context, request).credential
        if (credential is CustomCredential && credential.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
            GoogleResult.Token(GoogleIdTokenCredential.createFrom(credential.data).idToken)
        } else {
            GoogleResult.Failed("Google 로그인 정보를 받지 못했어요")
        }
    } catch (e: GetCredentialCancellationException) {
        GoogleResult.Cancelled
    } catch (e: NoCredentialException) {
        GoogleResult.Failed("이 폰에 로그인된 Google 계정이 없어요. 설정에서 Google 계정을 추가해 주세요")
    } catch (e: GetCredentialException) {
        GoogleResult.Failed("Google 로그인에 실패했어요 (${e.type})")
    }
}
