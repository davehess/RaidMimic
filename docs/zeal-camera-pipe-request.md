# Zeal request: the camera on the named pipe

**Asked for** (the guild lead, 2026-11-27): *"can we try to expose fov and camera position and zoom? see if it's feasible in
a pipe"*. This came after the blind radar, tested over the game, did not sit on the real walls. The radar draws from its own
camera behind the player because Mimic cannot see EverQuest's.

**Feasible, and small.** Read against Zeal `main` on 2026-11-27:

| What | Where it already is in Zeal |
|---|---|
| The render camera: position, heading, pitch, roll, field of view, aspect ratio, resolution | `GameStructures::CameraInfo` (`game_structures.h` ~1455), at `0x63B928` (`game_addresses.h`), reached through `Zeal::Game::get_camera()` |
| Which view is on (first person, overhead, chase, Zeal cam, free) | `Zeal::Game::camera_view` (`0x63BE68`), `GameEnums::CameraView` |
| Field of view as a setting | `CameraMods::fov`, saved as `[Zeal] Fov=` in `zeal.ini` (default 45) |
| Zeal cam's own zoom, pitch and yaw | private members of `CameraMods` (`zeal_cam_zoom`, `zeal_cam_pitch`, `zeal_cam_yaw`) |

The pipe's player message (`named_pipe.cpp`, ~line 334) already sends `location`, `heading`, `autoattack` and
`target_size`. The ask is one more object in it: **`docs/zeal-camera-pipe.patch`**, about ten lines. It reads the camera,
never writes it. Zoom needs no extra field: the camera's distance from the player's location is the zoom, whatever view
mode produced it.

**What Mimic does with it:** the radar puts its eye where EverQuest's is and draws with the same field of view, so the
wireframe sits on the real walls in every view mode and at every zoom. ⚙ → Line up the radar (2026-11-27) stays as the
fallback for players on an older Zeal.

**Units to check on the first capture:**
- `FieldOfView` is half the lens value (Zeal's own comment), and it is not yet known whether that is the vertical or
  horizontal angle.
- `Heading` and `Pitch` are floats on the camera, where the entity heading on the pipe is 0–512.

The first raw pipe line with the field settles both.

**Until then:** Mimic can read the field of view from `zeal.ini` without a Zeal change, but not the position or zoom.
Reading EverQuest's memory directly from Mimic is possible on Windows, but it is the kind of thing a server's rules can
forbid. It goes through Zeal or not at all.

**Status:** drafted, not sent. Sending it is the guild lead's call.
