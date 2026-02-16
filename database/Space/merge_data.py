import json
import re

print("Reading files...")
with open(r"c:\GitHub\Xenoah.github.io\database\Space\data.json", "r", encoding="utf-8") as f:
    data_content = f.read()

satellite_data_var = f"\n\nconst SATELLITE_DATA = {data_content};\n\n"

with open(r"c:\GitHub\Xenoah.github.io\database\Space\index.html", "r", encoding="utf-8") as f:
    html_content = f.read()

print("Applying changes...")
# Replace Constants
if "// --- Constants ---" in html_content:
    if "const SATELLITE_DATA =" not in html_content:
        html_content = html_content.replace("// --- Constants ---", "// --- Constants ---" + satellite_data_var)
        print("Inserted SATELLITE_DATA.")
    else:
        print("SATELLITE_DATA already present.")
else:
    print("Could not find // --- Constants --- marker.")

# Replace App
# Use non-greedy match for the block until 'return ('
# Be careful with whitespace and newlines
app_regex = re.compile(r"const App = \(\) => \{[\s\S]*?return \(", re.MULTILINE)

new_app_code = """const App = () => {
        const [data, setData] = useState(SATELLITE_DATA);
        const [loading, setLoading] = useState(false);
        const [error, setError] = useState(null);

        return ("""

if app_regex.search(html_content):
    html_content = app_regex.sub(new_app_code, html_content, count=1)
    print("Replaced App component logic.")
else:
    print("Could not find App component block via regex.")
    # Fallback debug
    print("Debug: nearby content around 'const App = () => {'")
    start = html_content.find("const App = () => {")
    if start != -1:
        print(html_content[start:start+200])

# Add crossorigin to esm.sh scripts if not present
if 'crossorigin="anonymous"' not in html_content:
    html_content = html_content.replace('src="https://esm.sh/', 'crossorigin="anonymous" src="https://esm.sh/')
    print("Added crossorigin attributes.")

print("Writing index.html...")
with open(r"c:\GitHub\Xenoah.github.io\database\Space\index.html", "w", encoding="utf-8") as f:
    f.write(html_content)

print("Done.")
