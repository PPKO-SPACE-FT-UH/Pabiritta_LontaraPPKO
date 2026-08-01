"""Entry point untuk menjalankan aplikasi Pa'Biritta."""
import os
from app import create_app

app = create_app()

@app.route('/_debug')
def _debug():
    from flask import Response
    lines = [
        f"template_folder = {app.template_folder}",
        f"exists = {os.path.exists(app.template_folder)}",
        "",
        "=== Files in /var/task/ ===",
    ]
    skip = {'_vendor', '_local', '__pycache__', 'lib', 'lib64', 'bin', 'include'}
    for root, dirs, files in os.walk('/var/task'):
        dirs[:] = [d for d in dirs if d not in skip]
        for f in files:
            if not f.endswith('.pyc'):
                lines.append(os.path.join(root, f).replace('/var/task/', ''))
    return Response('\n'.join(lines), mimetype='text/plain')

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)