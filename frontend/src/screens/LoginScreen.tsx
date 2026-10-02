import { useState, type FormEvent } from 'react';
import { useLogin } from '../api/auth';
import { messageOf } from '../api/client';
import { Button } from '../components/Button';
import { PhotoScreen } from '../components/PhotoScreen';
import { UnderlineInput } from '../components/UnderlineInput';
import { useSession } from '../stores/session';
import styles from './AuthScreen.module.css';

export function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const login = useLogin();

  function submit(e: FormEvent) {
    e.preventDefault();
    if (login.isPending) return;
    login.mutate({ email, password }, { onSuccess: (user) => useSession.getState().setLoggedIn(user) });
  }

  return (
    <PhotoScreen wordmark>
      <form className={styles.form} onSubmit={submit}>
        <UnderlineInput label="이메일" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={setEmail} />
        <UnderlineInput
          label="비밀번호"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={setPassword}
          error={login.error ? messageOf(login.error) : undefined}
        />
        <Button type="submit" loading={login.isPending}>로그인</Button>
        <p className={styles.switch}>
          계정이 없나요? <Button variant="text" onClick={() => useSession.getState().setScreen('signup')}>가입하기</Button>
        </p>
      </form>
    </PhotoScreen>
  );
}
