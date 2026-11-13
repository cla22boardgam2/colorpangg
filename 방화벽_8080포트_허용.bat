@echo off
chcp 65001 > nul
echo ==============================================================
echo   컬러팡 - 윈도우 방화벽 포트(8080) 허용 설정
echo   (반드시 마우스 우클릭 - 관리자 권한으로 실행 해주세요!)
echo ==============================================================
echo.
netsh advfirewall firewall add rule name="Colorpang Server 8080" dir=in action=allow protocol=TCP localport=8080
echo.
echo [완료] 포트 8080 방화벽 허용 규칙이 추가되었습니다!
echo.
pause
