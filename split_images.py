#!/usr/bin/env python3
"""
Split the 4x4 AI archetype meme grid into 16 individual images.

Usage:
    python3 split_images.py <path_to_grid_image>

The grid image should be the 4x4 meme with 16 AI archetype panels.
Images are saved to choose-your-fighter/images/type-00.png through type-15.png.

Grid layout (row-major order):
  Row 0: Enterprise Java Oracle, Moltbot Life-Automator, Vibecoder Comet, RAG Hoarder
  Row 1: Prompt Poet, GPU Peasant Wizard, Toolcall Gremlin, TypeScript Child of Destiny
  Row 2: Python Notebook Alchemist, LLM Evaluation Nerd, Security Paranoid Monk, Model Polygamist
  Row 3: 'I Don't Need AI' Boomer, Startup Founder LARPer, Claude Skills Grifter, Research Paper Cosplayer

These are remapped to our type index order (0-15) based on the quiz mapping.
"""
import sys
import os
from PIL import Image

# Grid position (row, col) -> our type index
# Our TYPES array order:
#  0: GPU Peasant Wizard       (row1, col1)
#  1: Enterprise Java Oracle   (row0, col0)
#  2: Moltbot Life-Automator   (row0, col1)
#  3: Toolcall Gremlin         (row1, col2)
#  4: Vibecoder Comet          (row0, col2)
#  5: Research Paper Cosplayer  (row3, col3)
#  6: Prompt Poet (Dark Arts)  (row1, col0)
#  7: Security Paranoid Monk   (row2, col2)
#  8: Python Notebook Alchemist(row2, col0)
#  9: TypeScript Child of Dest (row1, col3)
# 10: LLM Evaluation Nerd     (row2, col1)
# 11: Model Polygamist         (row2, col3)
# 12: 'I Don't Need AI' Boomer(row3, col0)
# 13: Startup Founder LARPer   (row3, col1)
# 14: Claude Skills Grifter    (row3, col2)
# 15: RAG Hoarder              (row0, col3)

GRID_MAP = {
    0:  (1, 1),  # GPU Peasant Wizard
    1:  (0, 0),  # Enterprise Java Oracle
    2:  (0, 1),  # Moltbot Life-Automator
    3:  (1, 2),  # Toolcall Gremlin
    4:  (0, 2),  # Vibecoder Comet
    5:  (3, 3),  # Research Paper Cosplayer
    6:  (1, 0),  # Prompt Poet (Dark Arts)
    7:  (2, 2),  # Security Paranoid Monk
    8:  (2, 0),  # Python Notebook Alchemist
    9:  (1, 3),  # TypeScript Child of Destiny
    10: (2, 1),  # LLM Evaluation Nerd
    11: (2, 3),  # Model Polygamist
    12: (3, 0),  # 'I Don't Need AI' Boomer
    13: (3, 1),  # Startup Founder LARPer
    14: (3, 2),  # Claude Skills Grifter
    15: (0, 3),  # RAG Hoarder
}

def split_grid(image_path, output_dir="choose-your-fighter/images"):
    os.makedirs(output_dir, exist_ok=True)

    img = Image.open(image_path)
    w, h = img.size
    cell_w = w // 4
    cell_h = h // 4

    print(f"Image size: {w}x{h}, cell size: {cell_w}x{cell_h}")

    for type_idx, (row, col) in GRID_MAP.items():
        left = col * cell_w
        top = row * cell_h
        right = left + cell_w
        bottom = top + cell_h

        cell = img.crop((left, top, right, bottom))
        out_path = os.path.join(output_dir, f"type-{type_idx:02d}.png")
        cell.save(out_path, "PNG")
        print(f"  type-{type_idx:02d}.png ({row},{col})")

    print(f"\nDone! {len(GRID_MAP)} images saved to {output_dir}/")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        # Try default path
        default = "grid.png"
        if os.path.exists(default):
            split_grid(default)
        else:
            print(f"Usage: {sys.argv[0]} <path_to_grid_image>")
            print(f"  or place the grid image as 'grid.png' in the current directory")
            sys.exit(1)
    else:
        split_grid(sys.argv[1])
