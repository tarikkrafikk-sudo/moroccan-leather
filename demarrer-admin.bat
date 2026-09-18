@echo off
REM ============================================================
REM  Moroccan Leather — Démarrage du panneau admin
REM  Double-clique sur ce fichier (une seule fois, a chaque fois
REM  que tu veux ouvrir le panneau admin). Ne double-clique JAMAIS
REM  directement sur admin.html — cela ne fonctionnera pas.
REM ============================================================

cd /d "%~dp0"

echo Demarrage du serveur...
start "Moroccan Leather - Serveur (ne pas fermer)" cmd /k node server.js

echo Attente du demarrage du serveur...
timeout /t 2 /nobreak >nul

echo Ouverture du panneau admin dans le navigateur...
start http://localhost:3000/admin.html

echo.
echo Le panneau admin devrait s'ouvrir dans ton navigateur.
echo Laisse la fenetre noire "Moroccan Leather - Serveur" ouverte
echo tant que tu utilises le panneau admin ou le site.
echo.
pause
