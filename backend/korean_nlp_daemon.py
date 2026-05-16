"""
상주 프로세스 모드: stdin에서 JSON 라인을 읽고 stdout으로 결과 반환
프로토콜: 한 줄에 하나의 JSON → 처리 → 한 줄에 하나의 JSON 응답
"""
import sys
import json
from korean_nlp import analyze_sentence, analyze_word

def main():
    sys.stdout.reconfigure(line_buffering=True)
    sys.stderr.reconfigure(line_buffering=True)
    print(json.dumps({"status": "ready"}), flush=True)

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
            mode = req.get('mode', 'sentence')
            text = req.get('text', '')
            if not text:
                result = {'error': 'no input'}
            elif mode == 'word':
                result = analyze_word(text)
            else:
                result = analyze_sentence(text)
            print(json.dumps(result, ensure_ascii=False), flush=True)
        except Exception as e:
            print(json.dumps({'error': str(e)}, ensure_ascii=False), flush=True)

if __name__ == '__main__':
    main()
