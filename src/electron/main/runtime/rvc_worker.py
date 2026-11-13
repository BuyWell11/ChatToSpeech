import contextlib
import json
import os
import sys
import tempfile
import traceback
from pathlib import Path


ENGINE_ROOT = Path(sys.argv[1]).resolve()
TEMP_DIR = Path(sys.argv[2]).resolve()
PROTOCOL_OUT = sys.stdout
sys.stdout = sys.stderr
sys.path.insert(0, str(ENGINE_ROOT))
os.chdir(ENGINE_ROOT)


def send(payload):
    PROTOCOL_OUT.write(json.dumps(payload, ensure_ascii=False) + "\n")
    PROTOCOL_OUT.flush()


def main():
    tts = None
    converter = None
    try:
        from rhvoice_wrapper import TTS
        import soundfile as sf
        from rvc.infer.infer import VoiceConverter

        tts = TTS(threads=1, quiet=True)
        converter = VoiceConverter()
        voices = getattr(tts, "voices", [])
        if isinstance(voices, dict):
            voices = list(voices.keys())
        send({"type": "ready", "voices": list(voices)})

        TEMP_DIR.mkdir(parents=True, exist_ok=True)

        for line in sys.stdin:
            request = {}
            try:
                request = json.loads(line)
                if request.get("action") == "shutdown":
                    break
                action = request.get("action")
                if action not in ("convert", "synthesize"):
                    raise ValueError(f"Неизвестная команда: {request.get('action')}")

                request_id = request["id"]
                output_path = Path(request["outputPath"]).resolve()
                output_path.parent.mkdir(parents=True, exist_ok=True)
                if action == "convert":
                    settings = request["settings"]
                    voice = request.get("ttsVoice", "anna")
                else:
                    voice = request["voice"]
                speech_data = tts.get(
                    request["text"],
                    voice=voice,
                    format_="wav",
                    sets=None,
                )
                if len(speech_data) <= 44:
                    raise RuntimeError("RHVoice не создал аудио для текста.")

                if action == "synthesize":
                    output_path.write_bytes(speech_data)
                else:
                    with tempfile.NamedTemporaryFile(
                        suffix=".wav", prefix="rhvoice_", dir=TEMP_DIR, delete=False
                    ) as source_file:
                        source_path = Path(source_file.name)
                        source_file.write(speech_data)

                    try:
                        model_path = str(Path(request["modelPath"]).resolve())
                        if converter.loaded_model and converter.loaded_model != model_path:
                            converter.cleanup_model()
                            converter.loaded_model = None
                            converter.last_embedder_model = None

                        with contextlib.redirect_stdout(sys.stderr):
                            converter.convert_audio(
                                audio_input_path=str(source_path),
                                audio_output_path=str(output_path),
                                model_path=model_path,
                                index_path=request.get("indexPath", ""),
                                pitch=int(settings.get("pitch", 0)),
                                f0_method=settings.get("f0Method", "rmvpe"),
                                index_rate=float(settings.get("indexRate", 0.45)),
                                volume_envelope=float(settings.get("volumeEnvelope", 1.0)),
                                protect=float(settings.get("protect", 0.33)),
                                embedder_model=settings.get("embedderModel", "contentvec"),
                                clean_audio=bool(settings.get("cleanAudio", False)),
                                clean_strength=float(settings.get("cleanStrength", 0.5)),
                                export_format="WAV",
                                sid=int(settings.get("speakerId", 0)),
                            )

                        if not output_path.is_file() or output_path.stat().st_size <= 44:
                            raise RuntimeError(
                                "RVC не создал выходной WAV. Проверьте модель и индекс в журнале выше."
                            )
                    finally:
                        source_path.unlink(missing_ok=True)

                volume = float(request.get("volume", 1.0))
                if volume < 0:
                    raise ValueError("Громкость не может быть отрицательной.")
                if volume != 1.0:
                    audio, sample_rate = sf.read(output_path, dtype="float32")
                    sf.write(output_path, audio * volume, sample_rate, subtype="PCM_16")

                if not output_path.is_file() or output_path.stat().st_size <= 44:
                    raise RuntimeError("Синтез не создал выходной WAV.")

                send({"id": request_id, "ok": True})
            except Exception as error:
                traceback.print_exc(file=sys.stderr)
                send({"id": request.get("id"), "ok": False, "error": str(error)})
    finally:
        if converter is not None:
            with contextlib.redirect_stdout(sys.stderr):
                converter.cleanup_model()
        if tts is not None:
            tts.join()


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        traceback.print_exc(file=sys.stderr)
        send({"type": "startup_error", "error": str(error)})
        raise
