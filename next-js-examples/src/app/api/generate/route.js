import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';

/**
 * POST /api/generate
 * Body: { primer_melody: "[...]", num_steps: number, config: "attention_rnn", qpm?: number }
 * Returns: { ok: true, url: "/generated/<file>.mid" }
 *
 * NOTE: This calls your conda-installed Magenta binary directly:
 *   /Users/Sharmayne/anaconda3/envs/magenta-legacy/bin/melody_rnn_generate
 * Adjust the binary path below if needed.
 */

export async function POST(req) {
  try {
    const body = await req.json();
    const { primer_melody, num_steps, config = 'attention_rnn', qpm = 120 } = body || {};

    if (!primer_melody || !num_steps) {
      return NextResponse.json({ ok: false, error: 'Missing primer_melody or num_steps' }, { status: 400 });
    }

    // Paths
    const projectRoot = process.cwd(); // .../next-js-examples
    const magentaBin = '/Users/Sharmayne/anaconda3/envs/magenta-legacy/bin/melody_rnn_generate';
    const bundlePath = path.join(projectRoot, 'music', 'bundles', `${config}.mag`);
    const publicOutDir = path.join(projectRoot, 'public', 'generated');

    // Ensure bundle & outdir exist
    await fsp.access(bundlePath).catch(() => { throw new Error(`Bundle not found: ${bundlePath}`); });
    await fsp.mkdir(publicOutDir, { recursive: true });

    // Snapshot files before, to detect the newly created file afterwards
    const before = new Set((await fsp.readdir(publicOutDir)).filter(f => f.endsWith('.mid')));

    // Build CLI args (we write directly to public/generated so the browser can fetch it)
    const args = [
      `--config=${config}`,
      `--bundle_file=${bundlePath}`,
      `--output_dir=${publicOutDir}`,
      `--num_outputs=1`,
      `--steps_per_quarter=4`,
      `--qpm=${qpm}`,
      `--num_steps=${num_steps}`,
      `--primer_melody=${primer_melody}`, // NOTE: this must arrive like "[60,67,...]"
    ];

    // Spawn Magenta
    const child = spawn(magentaBin, args, {
      cwd: projectRoot,
      env: {
        ...process.env,
        // Make sure the conda env bin is visible for any TF/Python helpers Magenta may use
        PATH: `/Users/Sharmayne/anaconda3/envs/magenta-legacy/bin:${process.env.PATH || ''}`,
        TF_CPP_MIN_LOG_LEVEL: '2',
      },
    });

    let stderr = '';
    child.stdout.on('data', d => { /* optional: console.log(d.toString()) */ });
    child.stderr.on('data', d => { stderr += d.toString(); });

    await new Promise((resolve, reject) => {
      child.on('error', reject);
      child.on('close', code => (code === 0 ? resolve() : reject(new Error(stderr || `Exit ${code}`))));
    });

    // Find the newest .mid file created in public/generated
    const afterList = (await fsp.readdir(publicOutDir)).filter(f => f.endsWith('.mid'));
    const newOnes = afterList.filter(f => !before.has(f));
    let selected = newOnes[0];

    // Fallback: pick the most recently modified .mid
    if (!selected) {
      let newest = null;
      let newestMtime = 0;
      for (const f of afterList) {
        const st = await fsp.stat(path.join(publicOutDir, f));
        if (st.mtimeMs > newestMtime) { newestMtime = st.mtimeMs; newest = f; }
      }
      selected = newest;
    }

    if (!selected) {
      throw new Error(`No MIDI file found in ${publicOutDir}`);
    }

    const url = `/generated/${selected}`;
    return NextResponse.json({ ok: true, url });

  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err?.message || err) }, { status: 500 });
  }
}
