import pygame
import os
import time

print("--- START DEBUGGING ---")

# 👇 DÙNG ĐƯỜNG DẪN TUYỆT ĐỐI (Hardcode) ĐỂ TEST CHO CHẮC
# Lưu ý: Thêm chữ r đằng trước để Python không bị lỗi dấu gạch chéo
mp3_path = r"D:\Workspace\ts\codefi\apps\cli\assets\tracks\focus.mp3"

print(f"Checking file: {mp3_path}")

if not os.path.exists(mp3_path):
    print("❌ ERROR: File van khong tim thay! Kiem tra lai duong dan.")
    exit()
else:
    print(f"✅ File found! Size: {os.path.getsize(mp3_path)} bytes")

# Init Mixer
try:
    print("Initializing Mixer...")
    # Init đơn giản nhất để test driver
    pygame.mixer.init()
    print(f"✅ Mixer Init Success!")
except Exception as e:
    print(f"❌ Mixer Init Failed: {e}")
    exit()

# Play
try:
    print("Loading music...")
    pygame.mixer.music.load(mp3_path)
    print("Playing music...")
    pygame.mixer.music.play()
    pygame.mixer.music.set_volume(1.0)
    
    print("🎵 DANG PHAT NHAC... (Cho 10s)")
    
    for i in range(10):
        if not pygame.mixer.music.get_busy():
            print("⚠️ Nhac tu dong tat!")
            break
        print(f"Dang hat... {i+1}/10")
        time.sleep(1)
        
except Exception as e:
    print(f"❌ Playback Error: {e}")

print("--- END DEBUGGING ---")