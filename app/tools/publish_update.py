"""밖 앱의 새 버전을 서버에 올린다. 앱이 켜질 때 이 정보를 보고 업데이트를 안내한다.

실행: python app/tools/publish_update.py <설치파일.apk> <versionCode> <versionName> "<변경사항>"
예:   python app/tools/publish_update.py share/Drop-outdoor.apk 3 0.3.0 "지도에 방향 표시 추가"
결과: backend/updates/drop-outdoor.apk, backend/updates/latest.json (서버를 다시 켜지 않아도 바로 적용된다)
versionCode는 앱을 빌드할 때 준 -PappVersionCode와 같아야 하고, 이전보다 커야 한다.
"""
import hashlib
import json
import shutil
import sys
from pathlib import Path

OUT = Path(__file__).resolve().parents[2] / 'backend/updates'

if __name__ == '__main__':
    if len(sys.argv) != 5:
        sys.exit(__doc__)
    apk, code, name, notes = Path(sys.argv[1]), int(sys.argv[2]), sys.argv[3], sys.argv[4]
    OUT.mkdir(parents=True, exist_ok=True)
    dest = OUT / 'drop-outdoor.apk'
    shutil.copyfile(apk, dest)
    info = {
        'version_code': code,
        'version_name': name,
        'notes': notes,
        'sha256': hashlib.sha256(dest.read_bytes()).hexdigest(),
        'size': dest.stat().st_size,
    }
    (OUT / 'latest.json').write_text(json.dumps(info, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'올렸어요: v{name} (code {code}), {info["size"] // 1024}KB')
