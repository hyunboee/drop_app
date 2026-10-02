import { useState, type FormEvent } from 'react';
import { useSignup } from '../api/auth';
import { messageOf } from '../api/client';
import { Button } from '../components/Button';
import { Checkbox } from '../components/Checkbox';
import { PhotoScreen } from '../components/PhotoScreen';
import { UnderlineInput } from '../components/UnderlineInput';
import { M_10_PASSWORD_MIN_LENGTH } from '../params';
import { useSession } from '../stores/session';
import styles from './AuthScreen.module.css';

const viewTerms = () => window.alert('약관 전문은 준비 중이에요');

export function SignupScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [terms, setTerms] = useState(false);
  const [location, setLocation] = useState(false);
  const [age, setAge] = useState(false);
  const signup = useSignup();

  const canSubmit = terms && location && age && password.length >= M_10_PASSWORD_MIN_LENGTH;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit || signup.isPending) return;
    signup.mutate(
      { email, password, agree_terms: true, agree_location: true, agree_age: true },
      { onSuccess: (user) => useSession.getState().setLoggedIn(user) },
    );
  }

  return (
    <PhotoScreen wordmark>
      <div className={styles.back}>
        <Button variant="text" onClick={() => useSession.getState().setScreen('login')}>‹ 로그인</Button>
      </div>
      <form className={styles.form} onSubmit={submit}>
        <UnderlineInput label="이메일" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={setEmail} />
        <UnderlineInput
          label={`비밀번호 (${M_10_PASSWORD_MIN_LENGTH}자 이상)`}
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={setPassword}
        />
        <div className={styles.checks}>
          <Checkbox label="이용약관·개인정보 처리 동의" checked={terms} onChange={setTerms} onViewTerms={viewTerms} />
          <Checkbox label="위치정보 이용 동의" checked={location} onChange={setLocation} onViewTerms={viewTerms} />
          <Checkbox label="만 14세 이상입니다" checked={age} onChange={setAge} onViewTerms={viewTerms} />
        </div>
        {signup.error && <p role="alert" className={styles.error}>{messageOf(signup.error)}</p>}
        <Button type="submit" loading={signup.isPending} disabled={!canSubmit}>가입하기</Button>
      </form>
    </PhotoScreen>
  );
}
