from PIL import Image, ImageDraw, ImageFont
import os

statuses = {
    'None': ('#888888', 'Not Started'),
    'Pending': ('#1E90FF', 'Pending...'),
    'AC': ("#22ff35", 'Accepted'),
    'CE': ("#f1ff29", 'Compile Error'),
    'RE': ('#f1ff29', 'Runtime Error'),
    'MLE': ("#ff9f31", 'Memory Limit Exceeded'),
    'TLE': ('#ff9f31', 'Time Limit Exceeded'),
    'WA': ("#df2500", 'Wrong Answer'),
}

width, height = 400, 120

for folder, (color, text) in statuses.items():
    img = Image.new('RGB', (width, height), '#1e1e1e')
    draw = ImageDraw.Draw(img)
    
    # Try to use a font, fallback to default
    try:
        font = ImageFont.truetype("arial.ttf", 24)
    except:
        try:
            font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 24)
        except:
            font = ImageFont.load_default()
    
    # Draw a colored bar on the left
    draw.rectangle([0, 0, 10, height], fill=color)
    
    # Draw text
    bbox = draw.textbbox((0, 0), text, font=font)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]
    x = (width - text_w) // 2
    y = (height - text_h) // 2
    draw.text((x, y), text, fill=color, font=font)
    
    # Add small subtitle
    sub = f"Placeholder for {folder}"
    try:
        sub_font = ImageFont.truetype("arial.ttf", 14)
    except:
        try:
            sub_font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 14)
        except:
            sub_font = ImageFont.load_default()
    
    bbox2 = draw.textbbox((0, 0), sub, font=sub_font)
    sub_w = bbox2[2] - bbox2[0]
    draw.text(((width - sub_w) // 2, y + text_h + 10), sub, fill='#aaaaaa', font=sub_font)
    
    out_dir = os.path.join('media', 'sets', folder)
    os.makedirs(out_dir, exist_ok=True)
    img.save(os.path.join(out_dir, 'placeholder.png'))

print("Placeholder images generated successfully.")
