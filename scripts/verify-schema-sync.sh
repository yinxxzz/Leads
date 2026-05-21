#!/bin/bash
# ============================================================================
# 验证迁移文件是否已同步到 full-schema.sql
# ============================================================================
# 用途：确保每个迁移文件的变更都已反映在 full-schema.sql 中
# 运行：./scripts/verify-schema-sync.sh
# ============================================================================

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 文件路径
MIGRATIONS_DIR="supabase/migrations"
FULL_SCHEMA="supabase/full-schema.sql"
SYNC_RECORD="supabase/.schema-sync-record.json"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Schema Sync Verification${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# 检查 full-schema.sql 是否存在
if [ ! -f "$FULL_SCHEMA" ]; then
  echo -e "${RED}❌ Error: $FULL_SCHEMA not found${NC}"
  exit 1
fi

# 获取所有迁移文件（按时间戳排序）
MIGRATION_FILES=$(find "$MIGRATIONS_DIR" -name "*.sql" -type f | sort)

if [ -z "$MIGRATION_FILES" ]; then
  echo -e "${YELLOW}⚠️  No migration files found${NC}"
  exit 0
fi

echo -e "${BLUE}📁 Found migration files:${NC}"
echo "$MIGRATION_FILES" | while read -r file; do
  echo "  - $(basename "$file")"
done
echo ""

# 检查每个迁移文件中的关键变更是否在 full-schema.sql 中
MISSING_CHANGES=()
TOTAL_CHECKS=0
PASSED_CHECKS=0

echo -e "${BLUE}🔍 Checking for missing changes...${NC}"
echo ""

# 提取迁移文件中的关键 SQL 语句
check_migration() {
  local migration_file=$1
  local migration_name=$(basename "$migration_file")
  
  echo -e "${YELLOW}Checking: $migration_name${NC}"
  
  # 提取 ADD COLUMN 语句中的列名
  local added_columns=$(grep -i "ADD COLUMN" "$migration_file" | grep -oE '\b[a-z_]+\b' | grep -v -E '^(ADD|COLUMN|IF|NOT|EXISTS|TEXT|INTEGER|BOOLEAN|TIMESTAMPTZ|UUID|DEFAULT|NULL|CHECK|IN)$' | sort -u)
  
  # 检查列名是否在 full-schema.sql 中
  for column in $added_columns; do
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    if grep -q "\b$column\b" "$FULL_SCHEMA"; then
      echo -e "  ${GREEN}✓${NC} Column '$column' found"
      PASSED_CHECKS=$((PASSED_CHECKS + 1))
    else
      echo -e "  ${RED}✗${NC} Column '$column' NOT found"
      MISSING_CHANGES+=("$migration_name: Column '$column'")
    fi
  done
  
  # 提取 CREATE INDEX 语句中的索引名
  local indexes=$(grep -i "CREATE INDEX" "$migration_file" | grep -oE 'idx_[a-z_]+' | sort -u)
  
  for index in $indexes; do
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    if grep -q "$index" "$FULL_SCHEMA"; then
      echo -e "  ${GREEN}✓${NC} Index '$index' found"
      PASSED_CHECKS=$((PASSED_CHECKS + 1))
    else
      echo -e "  ${RED}✗${NC} Index '$index' NOT found"
      MISSING_CHANGES+=("$migration_name: Index '$index'")
    fi
  done
  
  # 提取 CONSTRAINT 名称
  local constraints=$(grep -i "ADD CONSTRAINT" "$migration_file" | grep -oE '[a-z_]+_check' | sort -u)
  
  for constraint in $constraints; do
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    if grep -q "$constraint" "$FULL_SCHEMA"; then
      echo -e "  ${GREEN}✓${NC} Constraint '$constraint' found"
      PASSED_CHECKS=$((PASSED_CHECKS + 1))
    else
      echo -e "  ${RED}✗${NC} Constraint '$constraint' NOT found"
      MISSING_CHANGES+=("$migration_name: Constraint '$constraint'")
    fi
  done
  
  echo ""
}

# 检查所有迁移文件
while IFS= read -r migration_file; do
  check_migration "$migration_file"
done <<< "$MIGRATION_FILES"

# 输出结果
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Verification Results${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "Total checks: $TOTAL_CHECKS"
echo -e "${GREEN}Passed: $PASSED_CHECKS${NC}"
echo -e "${RED}Failed: $((TOTAL_CHECKS - PASSED_CHECKS))${NC}"
echo ""

# 如果有缺失的变更，显示详情并退出
if [ ${#MISSING_CHANGES[@]} -gt 0 ]; then
  echo -e "${RED}❌ The following changes are missing from $FULL_SCHEMA:${NC}"
  echo ""
  for change in "${MISSING_CHANGES[@]}"; do
    echo -e "  ${RED}✗${NC} $change"
  done
  echo ""
  echo -e "${YELLOW}💡 Action required:${NC}"
  echo -e "  1. Review the missing changes listed above"
  echo -e "  2. Manually update $FULL_SCHEMA to include these changes"
  echo -e "  3. Run this script again to verify"
  echo ""
  exit 1
else
  echo -e "${GREEN}✅ All migration changes are present in $FULL_SCHEMA${NC}"
  echo ""
  
  # 更新同步记录
  LAST_MIGRATION=$(echo "$MIGRATION_FILES" | tail -n 1 | xargs basename)
  SYNC_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  
  mkdir -p "$(dirname "$SYNC_RECORD")"
  cat > "$SYNC_RECORD" <<EOF
{
  "last_verified_migration": "$LAST_MIGRATION",
  "last_sync_time": "$SYNC_TIME",
  "total_checks": $TOTAL_CHECKS,
  "passed_checks": $PASSED_CHECKS
}
EOF
  
  echo -e "${GREEN}📝 Sync record updated: $SYNC_RECORD${NC}"
  echo ""
  exit 0
fi

