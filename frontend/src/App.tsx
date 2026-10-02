import { useMe } from './api/auth';
import { ApiError, messageOf } from './api/client';
import { ArScreen } from './screens/ArScreen';
import { LoginScreen } from './screens/LoginScreen';
import { PermissionDeniedScreen } from './screens/PermissionDeniedScreen';
import { SignupScreen } from './screens/SignupScreen';
import { StartScreen } from './screens/StartScreen';
import { useSession } from './stores/session';

export function App() {
  const me = useMe();
  const screen = useSession((s) => s.screen);

  if (me.isPending) return null;
  if (me.isError && !(me.error instanceof ApiError && me.error.code === 'AUTH_REQUIRED')) {
    return (
      <div role="alert">
        <p>{messageOf(me.error)}</p>
        <button type="button" onClick={() => void me.refetch()}>
          다시 시도
        </button>
      </div>
    );
  }

  switch (screen) {
    case 'login': return <LoginScreen />;
    case 'signup': return <SignupScreen />;
    case 'start': return <StartScreen />;
    case 'denied': return <PermissionDeniedScreen />;
    case 'ar': return <ArScreen />;
  }
}
