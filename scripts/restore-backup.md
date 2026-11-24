# 백업 복원 방법

1. GitHub 저장소 → 브랜치 `backups` → `backups/날짜.json.asc` 다운로드
2. 암호 풀기 (맥 터미널, gpg 필요: `brew install gnupg`)
   ```
   gpg --decrypt 2026-11-30.json.asc > backup.json
   ```
   암호를 물으면 형민이 따로 보관한 백업 암호 입력 (저장소에는 없음)
3. `backup.json` 안에 stores·staff·requests·schedules·month_settings·swaps 테이블이 행 단위로 들어 있음.
   새 Supabase 프로젝트에 migrations 0001~0005를 적용한 뒤 각 테이블에 insert 하면 복원됨.
4. 새 프로젝트로 옮긴 경우 `backup_secret` 에 암호를 다시 넣어야 주간 백업이 이어짐:
   `insert into backup_secret (id, pass) values (1, '<암호>');`
