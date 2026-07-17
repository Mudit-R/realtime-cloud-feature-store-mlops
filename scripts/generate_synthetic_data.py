#!/usr/bin/env python
import argparse
import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from src.data.generator import main

if __name__ == "__main__":
    main()
