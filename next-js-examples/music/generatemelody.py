#!/usr/bin/env python3
import argparse, json, shlex, subprocess, sys
from pathlib import Path
from datetime import datetime

def main():
    p = argparse.ArgumentParser()
    p.add_argument('--spec', help='Path to primer JSON; if omitted, read from stdin')
    p.add_argument('--bin',  default='/Users/Sharmayne/anaconda3/envs/magenta-legacy/bin/melody_rnn_generate')
    p.add_argument('--bundle', default='music/bundles/attention_rnn.mag')
    p.add_argument('--outdir', default='public/generated')
    p.add_argument('--qpm', type=int, default=120)
    p.add_argument('--steps_per_quarter', type=int, default=4)
    args = p.parse_args()

    root = Path(__file__).resolve().parents[1]  # repo root: next-js-examples
    outdir = (root / args.outdir); outdir.mkdir(parents=True, exist_ok=True)
    bundle = (root / args.bundle); assert bundle.exists(), f"Bundle not found: {bundle}"

    spec = {}
    if args.spec:
      spec = json.loads(Path(args.spec).read_text())
    else:
      spec = json.loads(sys.stdin.read())

    primer = spec['primer_melody']          # string like "[60,67,...]"
    num_steps = int(spec['num_steps'])
    config = spec.get('config', 'attention_rnn')

    cmd = [
      args.bin,
      f'--config={config}',
      f'--bundle_file={str(bundle)}',
      f'--output_dir={str(outdir)}',
      '--num_outputs=1',
      f'--steps_per_quarter={args.steps_per_quarter}',
      f'--qpm={args.qpm}',
      f'--num_steps={num_steps}',
      f'--primer_melody={primer}',
    ]
    print('Running:', ' '.join(cmd))
    subprocess.run(cmd, check=True)
    print('Done. Output dir:', outdir)

if __name__ == '__main__':
    main()
