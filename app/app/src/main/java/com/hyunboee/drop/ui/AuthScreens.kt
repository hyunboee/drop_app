package com.hyunboee.drop.ui

import android.widget.Toast
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextDecoration
import com.hyunboee.drop.M_10_PASSWORD_MIN_LENGTH
import com.hyunboee.drop.api.ApiException
import com.hyunboee.drop.api.DEFAULT_MESSAGE
import com.hyunboee.drop.auth.GoogleResult
import com.hyunboee.drop.auth.Session
import com.hyunboee.drop.auth.googleIdToken
import com.hyunboee.drop.lib.canSignup
import kotlinx.coroutines.launch

// NW-01 로그인 (스타일 가이드 5장 W-01: 사진 배경, 워드마크, 밑줄 입력란 2개, 주요 버튼, 텍스트 버튼)
@Composable
fun LoginScreen(session: Session, onSignup: () -> Unit) {
    val scope = rememberCoroutineScope()
    // 저장해 둔 로그인 정보가 있으면 미리 채워 두고 체크도 켜 둔다
    val saved = remember { session.savedLogin() }
    var email by remember { mutableStateOf(saved?.first ?: "") }
    var password by remember { mutableStateOf(saved?.second ?: "") }
    var keepLogin by remember { mutableStateOf(saved != null) }
    val context = LocalContext.current
    var googleToken by remember { mutableStateOf<String?>(null) } // 처음 오는 구글 계정이라 약관 동의를 받는 중인 토큰
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }

    PhotoScreen {
        UnderlineInput("이메일", email, { email = it }, placeholder = "you@example.com", keyboardType = KeyboardType.Email)
        UnderlineInput("비밀번호", password, { password = it }, password = true, keyboardType = KeyboardType.Password, error = error)
        DropCheckbox("로그인 정보 저장", keepLogin, { keepLogin = it })
        PrimaryButton(
            "로그인",
            onClick = {
                busy = true
                error = null
                scope.launch {
                    try {
                        session.login(email.trim(), password)
                        session.rememberLogin(keepLogin, email.trim(), password)
                    } catch (e: ApiException) {
                        error = e.message ?: DEFAULT_MESSAGE
                    } finally {
                        busy = false
                    }
                }
            },
            enabled = email.isNotBlank() && password.isNotEmpty(),
            loading = busy,
        )
        // 폰에 로그인된 구글 계정을 골라 바로 연결한다
        SecondaryButton(
            "Google로 계속하기",
            onClick = {
                busy = true
                error = null
                scope.launch {
                    try {
                        when (val r = googleIdToken(context)) {
                            is GoogleResult.Token -> try {
                                session.googleLogin(r.idToken, false)
                            } catch (e: ApiException) {
                                if (e.code == "CONSENT_REQUIRED") googleToken = r.idToken else error = e.message ?: DEFAULT_MESSAGE
                            }
                            is GoogleResult.Failed -> error = r.message
                            GoogleResult.Cancelled -> {}
                        }
                    } finally {
                        busy = false
                    }
                }
            },
            enabled = !busy,
        )
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
            Text("계정이 없나요?", style = Tokens.Link.copy(textDecoration = TextDecoration.None), color = Tokens.TextSub)
            Spacer(Modifier.size(Tokens.Space1))
            TextLink("가입하기", onSignup)
        }
    }

    // 처음 Google로 오는 계정은 가입 때와 같은 동의 3개를 받는다
    googleToken?.let { token ->
        var terms by remember { mutableStateOf(false) }
        var location by remember { mutableStateOf(false) }
        var age by remember { mutableStateOf(false) }
        AlertDialog(
            onDismissRequest = { googleToken = null },
            title = { Text("처음 오셨네요") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(Tokens.Space3)) {
                    DropCheckbox("이용약관·개인정보 처리 동의", terms, { terms = it })
                    DropCheckbox("위치정보 이용 동의", location, { location = it })
                    DropCheckbox("만 14세 이상입니다", age, { age = it })
                }
            },
            confirmButton = {
                TextButton(
                    enabled = terms && location && age && !busy,
                    onClick = {
                        googleToken = null
                        busy = true
                        error = null
                        scope.launch {
                            try {
                                session.googleLogin(token, true)
                            } catch (e: ApiException) {
                                error = e.message ?: DEFAULT_MESSAGE
                            } finally {
                                busy = false
                            }
                        }
                    },
                ) { Text("동의하고 계속") }
            },
            dismissButton = { TextButton(onClick = { googleToken = null }) { Text("취소") } },
        )
    }
}


// NW-02 회원가입 (W-02: "‹ 로그인", 밑줄 입력란 2개, 체크박스 3개, 오류 문구, 주요 버튼)
@Composable
fun SignupScreen(session: Session, onBack: () -> Unit) {
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var terms by remember { mutableStateOf(false) }
    var location by remember { mutableStateOf(false) }
    var age by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    val viewTerms = { Toast.makeText(context, "약관 전문은 준비 중이에요", Toast.LENGTH_SHORT).show() }

    PhotoScreen(top = { TextLink("‹ 로그인", onBack) }) {
        UnderlineInput("이메일", email, { email = it }, placeholder = "you@example.com", keyboardType = KeyboardType.Email)
        UnderlineInput("비밀번호 (${M_10_PASSWORD_MIN_LENGTH}자 이상)", password, { password = it }, password = true, keyboardType = KeyboardType.Password)
        Column(verticalArrangement = Arrangement.spacedBy(Tokens.Space3)) {
            DropCheckbox("이용약관·개인정보 처리 동의", terms, { terms = it }, viewTerms)
            DropCheckbox("위치정보 이용 동의", location, { location = it }, viewTerms)
            DropCheckbox("만 14세 이상입니다", age, { age = it }, viewTerms)
            // AR 기능이 카메라·위치 데이터를 Google에 보낸다는 점을 가입 때 알린다 (네이티브 PRD NFR-N06)
            Text("AR 기능을 쓰는 동안 카메라·위치 데이터가 Google에 전송돼요", style = Tokens.Caption, color = Tokens.TextMuted, modifier = Modifier.padding(top = Tokens.Space1))
        }
        error?.let { Text(it, style = Tokens.Caption, color = Tokens.Error) }
        PrimaryButton(
            "가입하기",
            onClick = {
                busy = true
                error = null
                scope.launch {
                    try {
                        session.signup(email.trim(), password)
                    } catch (e: ApiException) {
                        error = e.message ?: DEFAULT_MESSAGE
                    } finally {
                        busy = false
                    }
                }
            },
            enabled = canSignup(email.trim(), password, terms, location, age),
            loading = busy,
        )
    }
}
