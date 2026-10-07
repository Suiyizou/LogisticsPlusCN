#!/usr/bin/env bash
#
# 发布/备份脚本的共享工具。
#
# 关键约束（对应复查 R04）：**绝不 source .env**。dotenv 内容可能包含空格、#、$、
# 引号等，Compose 能解析但 Bash 会把它当命令执行。这里只做按行的键值提取，不 eval。
set -euo pipefail

# 从 .env 读取一个键的值；找不到返回默认值。不执行文件内容。
dotenv_value() {
  local key="$1" default_value="${2-}" line="" value=""
  local file="${ENV_FILE:-${ROOT:-.}/.env}"
  if [[ -f "$file" ]]; then
    line="$(grep -E "^[[:space:]]*${key}[[:space:]]*=" "$file" | tail -n 1 || true)"
  fi
  if [[ -z "$line" ]]; then
    printf '%s' "$default_value"
    return 0
  fi
  value="${line#*=}"
  value="${value%$'\r'}"
  if [[ ${#value} -ge 2 ]]; then
    if [[ "${value:0:1}" == '"' && "${value: -1}" == '"' ]]; then value="${value:1:${#value}-2}"; fi
    if [[ "${value:0:1}" == "'" && "${value: -1}" == "'" ]]; then value="${value:1:${#value}-2}"; fi
  fi
  printf '%s' "$value"
}

require_nonempty_file() {
  local file="$1" label="$2"
  if [[ ! -s "$file" ]]; then
    echo "[error] $label 缺失或为空: $file" >&2
    exit 1
  fi
}

_hash_tool() {
  if command -v sha256sum >/dev/null 2>&1; then
    printf 'sha256sum'
  elif command -v shasum >/dev/null 2>&1; then
    printf 'shasum'
  fi
}

write_checksums() {
  local dir="$1" tool
  tool="$(_hash_tool)"
  if [[ -z "$tool" ]]; then
    echo "[warn] 无 sha256sum/shasum，跳过校验和生成" >&2
    return 0
  fi
  (
    cd "$dir"
    find . -maxdepth 1 -type f ! -name 'checksums.sha256' -printf '%P\n' 2>/dev/null \
      | sort \
      | while read -r name; do [[ -n "$name" ]] && "$tool" "$name"; done \
      > checksums.sha256
  )
}

verify_checksums() {
  local dir="$1" tool
  tool="$(_hash_tool)"
  if [[ -z "$tool" ]]; then
    echo "[warn] 无 sha256sum/shasum，跳过备份校验" >&2
    return 0
  fi
  [[ -s "$dir/checksums.sha256" ]] || { echo "[error] 缺少 checksums.sha256: $dir" >&2; exit 1; }
  ( cd "$dir" && "$tool" -c checksums.sha256 >/dev/null )
  echo "[verify] checksums ok: $dir"
}

# 解析 SHIPMENT_FILE_HOST_PATH（相对路径按仓库根展开）。空值返回空。
shipment_files_dir() {
  local host_path
  host_path="$(dotenv_value SHIPMENT_FILE_HOST_PATH ./data/shipment-files)"
  [[ -n "$host_path" ]] || return 0
  case "$host_path" in
    /*|[A-Za-z]:*) printf '%s' "$host_path" ;;
    ./*) printf '%s/%s' "$ROOT" "${host_path#./}" ;;
    *) printf '%s/%s' "$ROOT" "$host_path" ;;
  esac
}
