@echo off
reg add "HKCU\Software\Classes\ai-ide" /ve /t REG_SZ /d "URL:AI IDE Protocol" /f
reg add "HKCU\Software\Classes\ai-ide" /v "URL Protocol" /t REG_SZ /d "" /f
reg add "HKCU\Software\Classes\ai-ide\shell\open\command" /ve /t REG_SZ /d "\"node\" \"C:\coding\ideeb\AI-Intergrated-Web-IDE\native-picker.js\" \"%%1\"" /f
