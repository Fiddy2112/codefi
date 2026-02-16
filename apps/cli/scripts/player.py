import sys
import os
import time
import threading

# Tắt log rác của Pygame
os.environ['PYGAME_HIDE_SUPPORT_PROMPT'] = "hide"
import pygame

def log_to_file(message):
    try:
        log_path = os.path.join(os.path.dirname(__file__), "debug_log.txt")
        with open(log_path, "a", encoding="utf-8") as f:
            timestamp = time.strftime("%H:%M:%S")
            f.write(f"[{timestamp}] {message}\n")
    except:
        pass

is_paused = False

def listen_commands():
    global is_paused
    log_to_file("-> Thread nghe lệnh đã khởi động.")
    while True:
        try:
            line = sys.stdin.readline()
            if not line:
                log_to_file("-> Node.js đã ngắt kết nối (Stdin closed).")
                break
            
            cmd = line.strip()
            if not cmd: continue # Bỏ qua dòng trống
            
            log_to_file(f"-> Nhận lệnh: {cmd}")
            
            if cmd.startswith("VOL:"):
                try:
                    vol = float(cmd.split(":")[1])
                    # Chuẩn hóa volume về 0.0 - 1.0
                    final_vol = max(0.0, min(1.0, vol / 100.0 if vol > 1.0 else vol))
                    pygame.mixer.music.set_volume(final_vol)
                except: pass

            elif cmd == "PAUSE":
                pygame.mixer.music.pause()
                is_paused = True
                log_to_file("   -> Đã tạm dừng.")
            elif cmd == "RESUME":
                pygame.mixer.music.unpause()
                is_paused = False
                log_to_file("   -> Đã tiếp tục.")
            elif cmd == "STOP":
                log_to_file("-> Nhận lệnh STOP. Thoát.")
                pygame.mixer.music.stop()
                os._exit(0) # Thoát quyết liệt để đóng toàn bộ thread
        except Exception as e:
            log_to_file(f"-> Lỗi luồng lệnh: {e}")
            break

def play_music(raw_path, initial_volume):
    # 1. Làm sạch đường dẫn (Xử lý dấu ngoặc kép dư thừa từ Windows Shell)
    file_path = raw_path.strip().strip('"').strip("'")
    
    # Xóa log cũ
    try:
        log_path = os.path.join(os.path.dirname(__file__), "debug_log.txt")
        if os.path.exists(log_path): os.remove(log_path)
    except: pass

    log_to_file(f"=== BẮT ĐẦU SCRIPT ===")
    log_to_file(f"Path nhận từ Node: {raw_path}")
    log_to_file(f"Path đã làm sạch: {file_path}")

    try:
        pygame.mixer.pre_init(frequency=44100, size=16, channels=2, buffer=4096)
        pygame.init()
        pygame.mixer.init()
        
        if not os.path.exists(file_path):
            log_to_file(f"❌ LỖI: Không thấy file tại {file_path}")
            # Gửi lỗi về stderr để Node.js bắt được trong catch block
            sys.stderr.write(f"Missing Audio File: {file_path}\n")
            sys.stderr.flush()
            return

        pygame.mixer.music.load(file_path)
        
        start_vol = float(initial_volume)
        pygame.mixer.music.set_volume(start_vol / 100.0 if start_vol > 1.0 else start_vol)
        
        pygame.mixer.music.play()
        
        # Gửi READY kèm theo flush=True để Node.js nhận được ngay
        print(f"READY:{os.path.basename(file_path)}", flush=True)

        t = threading.Thread(target=listen_commands, daemon=True)
        t.start()

        while True:
            is_busy = pygame.mixer.music.get_busy()
            if not is_busy and not is_paused:
                log_to_file("Nhạc đã dừng (Hết bài).")
                break
            time.sleep(0.5)

    except Exception as e:
        log_to_file(f"❌ LỖI CRASH: {str(e)}")
        sys.stderr.write(f"ERROR:{str(e)}\n")
        sys.stderr.flush()

if __name__ == "__main__":
    if len(sys.argv) >= 3:
        play_music(sys.argv[1], sys.argv[2])
    else:
        log_to_file("❌ Lỗi: Thiếu tham số!")