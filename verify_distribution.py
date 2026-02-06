#!/usr/bin/env python3
"""
Verify that the quiz mapping produces exactly 64 combinations per type
across all 1024 possible answer patterns (2^10).

Mapping uses XOR (linear map over GF(2)):
  bit_0 = Q1 XOR Q5 XOR Q9
  bit_1 = Q2 XOR Q6 XOR Q10
  bit_2 = Q3 XOR Q7
  bit_3 = Q4 XOR Q8

This gives a 4-bit type index (0-15) for each of 16 types.
Since it's a linear map from {0,1}^10 -> {0,1}^4 with rank 4,
the kernel has dimension 6, so each preimage has exactly 2^6 = 64 elements.
"""

from collections import Counter

TYPES = [
    "The GPU Peasant Wizard",          # 0  (0000)
    "The Enterprise Java Oracle",      # 1  (0001)
    "The Moltbot Life-Automator",      # 2  (0010)
    "The Toolcall Gremlin",            # 3  (0011)
    "The Vibecoder Comet",             # 4  (0100)
    "The Research Paper Cosplayer",    # 5  (0101)
    "The Prompt Poet (Dark Arts)",     # 6  (0110)
    "The Security Paranoid Monk",      # 7  (0111)
    "The Python Notebook Alchemist",   # 8  (1000)
    "The TypeScript Child of Destiny", # 9  (1001)
    "The LLM Evaluation Nerd",        # 10 (1010)
    "The Model Polygamist",           # 11 (1011)
    "The 'I Don't Need AI' Boomer",   # 12 (1100)
    "The Startup Founder LARPer",     # 13 (1101)
    "The Claude Skills Grifter",      # 14 (1110)
    "The RAG Hoarder",                # 15 (1111)
]

def get_type_index(answers):
    """
    answers: list of 10 bools/ints (0 or 1) for Q1..Q10
    Returns type index 0-15.
    """
    q = answers  # q[0]=Q1, q[1]=Q2, ..., q[9]=Q10
    bit0 = q[0] ^ q[4] ^ q[8]   # Q1 XOR Q5 XOR Q9
    bit1 = q[1] ^ q[5] ^ q[9]   # Q2 XOR Q6 XOR Q10
    bit2 = q[2] ^ q[6]          # Q3 XOR Q7
    bit3 = q[3] ^ q[7]          # Q4 XOR Q8
    return (bit3 << 3) | (bit2 << 2) | (bit1 << 1) | bit0

def main():
    counts = Counter()
    for i in range(1024):
        answers = [(i >> bit) & 1 for bit in range(10)]
        idx = get_type_index(answers)
        counts[idx] += 1

    print("Distribution across all 1024 answer combinations:")
    print("=" * 55)
    all_equal = True
    for idx in range(16):
        count = counts[idx]
        bar = "#" * count
        status = "OK" if count == 64 else "UNEVEN!"
        if count != 64:
            all_equal = False
        print(f"  [{idx:2d}] {TYPES[idx]:40s} = {count:3d} {status}")
    print("=" * 55)
    if all_equal:
        print("PASS: All 16 types have exactly 64 combinations each.")
    else:
        print("FAIL: Distribution is not even!")
    return 0 if all_equal else 1

if __name__ == "__main__":
    exit(main())
