#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-only
"""Check static catalog and page files without third-party dependencies."""
import datetime as dt
import json
import re
import struct
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / 'dist'
TEMPLATE = json.loads((ROOT / 'templates/data.template.json').read_text(encoding='utf-8'))


def check(path):
    data = json.loads(path.read_text(encoding='utf-8'))
    def need(ok, message):
        if not ok:
            raise ValueError(message)
    def positive(v):
        return type(v) is int and v > 0
    need(list(data) == list(TEMPLATE), '顶层字段或顺序不匹配')
    need(type(data['schema_version']) is int and data['schema_version'] == 1 and data['language'] == 'zh-CN', '版本或语言不匹配')
    need(isinstance(data['title'], str) and data['title'].strip(), '书名为空')
    need(data['page_pattern'] == 'P%04d.png' and type(data['render_dpi']) is int and data['render_dpi'] == 200, '图片格式不匹配')
    need(positive(data['page_count']) and data['page_count'] <= 9999 and positive(data['body_character_count']), '页数或字数无效')
    need(list(data['tags']) == list(TEMPLATE['tags']), '标签字段不匹配')
    for values in data['tags'].values():
        need(type(values) is list and all(isinstance(v, str) and v.strip() for v in values) and len(values) == len(set(values)), '标签数组无效')
    zone = dt.timezone(dt.timedelta(hours=8)) if data['timezone'] == 'Asia/Shanghai' else ZoneInfo(data['timezone'])
    times = []
    for name in ['writing_started_at', 'writing_completed_at']:
        value = data[name]
        if value is None:
            times.append(None)
        else:
            need(isinstance(value, str) and re.fullmatch(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})', value), '时间格式不匹配')
            stamp = dt.datetime.fromisoformat(value.replace('Z', '+00:00'))
            need(stamp.utcoffset() == stamp.astimezone(zone).utcoffset(), '时间偏移与时区不符')
            times.append(stamp)
    need(not all(times) or times[0] <= times[1], '撰写时间倒序')
    previous = (0, 0)
    offset = None
    need(type(data['chapters']) is list and data['chapters'], '章节为空')
    for c in data['chapters']:
        need(list(c) == ['title', 'body_page', 'physical_page'], '章节字段不匹配')
        need(isinstance(c['title'], str) and c['title'].strip(), '章节标题为空')
        b, p = c['body_page'], c['physical_page']
        need(positive(b) and positive(p) and previous[0] < b <= p <= data['page_count'] and p > previous[1], '章节页号无效')
        need(offset is None or p - b == offset, '正文页码偏移不一致')
        offset, previous = p - b, (b, p)
    need(data['chapters'][0]['body_page'] == 1, '首章正文页码非 1')
    expected = {f'P{i:04d}.png' for i in range(1, data['page_count'] + 1)}
    actual = {p.name for p in path.parent.iterdir() if p.suffix.lower() == '.png'}
    need(expected == actual, 'PNG 编号或数量不匹配')
    sizes = set()
    for name in expected:
        with (path.parent / name).open('rb') as f:
            header = f.read(24)
        need(header[:8] == b'\x89PNG\r\n\x1a\n' and header[12:16] == b'IHDR', '无效 PNG: ' + name)
        width, height = struct.unpack('>II', header[16:24])
        need(width > 0 and height > 0 and abs(width / height - 148 / 210) < .005, '图片比例非 A5')
        sizes.add((width, height))
    need(len(sizes) == 1, '页面图片尺寸不一致')
    need(isinstance(data['pdf_file'], str) and re.fullmatch(r'\.\./[^/\\]+\.pdf', data['pdf_file']), 'PDF 路径格式无效')
    need((path.parent / data['pdf_file']).is_file(), 'PDF 路径不存在')
    print(f"通过：{data['title']}，{data['page_count']} 页，{len(data['chapters'])} 章")


if __name__ == '__main__':
    try:
        paths = json.loads((WEB / 'books/index.json').read_text())
        if not isinstance(paths, list) or len(paths) != len(set(paths)):
            raise ValueError('清单无效或路径重复')
        for item in paths:
            if not isinstance(item, str) or not item or (WEB / item).resolve().is_relative_to(WEB) is False:
                raise ValueError('清单路径无效')
            check(WEB / item)
    except (ValueError, OSError, TypeError, KeyError) as error:
        raise SystemExit(f'检查失败：{error}')
