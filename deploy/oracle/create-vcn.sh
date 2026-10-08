#!/usr/bin/env bash
set -euo pipefail

# Cria VCN + sub-rede PUBLICA + Internet Gateway + rota 0.0.0.0/0 + portas 22/80/443.
# Antes: oci session authenticate --region sa-saopaulo-1
# Uso:  bash deploy/oracle/create-vcn.sh

REGION="${OCI_REGION:-sa-saopaulo-1}"
VCN_NAME="${VCN_NAME:-vcn-arena}"
SUBNET_NAME="${SUBNET_NAME:-subnet-public}"
VCN_CIDR="10.0.0.0/16"
SUBNET_CIDR="10.0.0.0/24"

echo "Regiao: $REGION"
COMPARTMENT_ID="$(oci iam compartment list --all --compartment-id-in-subtree true --access-level ACCESSIBLE --query "data[?name=='marcosfranc4' || \"lifecycle-state\"=='ACTIVE'] | [0].id" --raw-output 2>/dev/null || true)"
if [[ -z "${COMPARTMENT_ID}" || "${COMPARTMENT_ID}" == "null" ]]; then
  TENANCY="$(oci iam user get --user-id "$(oci iam user list --query 'data[0].id' --raw-output)" --query 'data."compartment-id"' --raw-output 2>/dev/null || true)"
  COMPARTMENT_ID="$(oci iam availability-domain list --query 'data[0]."compartment-id"' --raw-output)"
fi
echo "Compartimento: $COMPARTMENT_ID"

AD="$(oci iam availability-domain list --compartment-id "$COMPARTMENT_ID" --query 'data[0].name' --raw-output)"
echo "AD: $AD"

echo "Criando VCN..."
VCN_ID="$(oci network vcn create \
  --compartment-id "$COMPARTMENT_ID" \
  --display-name "$VCN_NAME" \
  --cidr-block "$VCN_CIDR" \
  --dns-label arena \
  --wait-for-state AVAILABLE \
  --query 'data.id' --raw-output)"
echo "VCN: $VCN_ID"

RT_ID="$(oci network vcn get --vcn-id "$VCN_ID" --query 'data."default-route-table-id"' --raw-output)"
SL_ID="$(oci network vcn get --vcn-id "$VCN_ID" --query 'data."default-security-list-id"' --raw-output)"

echo "Internet Gateway..."
IGW_ID="$(oci network internet-gateway create \
  --compartment-id "$COMPARTMENT_ID" \
  --vcn-id "$VCN_ID" \
  --display-name igw-arena \
  --is-enabled true \
  --wait-for-state AVAILABLE \
  --query 'data.id' --raw-output)"

echo "Rota 0.0.0.0/0 -> Internet Gateway..."
oci network route-table update --rt-id "$RT_ID" --force --route-rules "[
  {\"cidrBlock\":\"0.0.0.0/0\",\"networkEntityId\":\"$IGW_ID\",\"description\":\"internet\"}
]" >/dev/null

echo "Abrindo 22, 80, 443..."
oci network security-list update --security-list-id "$SL_ID" --force --ingress-security-rules '[
  {"protocol":"6","source":"0.0.0.0/0","sourceType":"CIDR_BLOCK","tcpOptions":{"destinationPortRange":{"min":22,"max":22}},"description":"ssh"},
  {"protocol":"6","source":"0.0.0.0/0","sourceType":"CIDR_BLOCK","tcpOptions":{"destinationPortRange":{"min":80,"max":80}},"description":"http"},
  {"protocol":"6","source":"0.0.0.0/0","sourceType":"CIDR_BLOCK","tcpOptions":{"destinationPortRange":{"min":443,"max":443}},"description":"https"},
  {"protocol":"1","source":"0.0.0.0/0","sourceType":"CIDR_BLOCK","icmpOptions":{"type":3,"code":4},"description":"mtu"}
]' --egress-security-rules '[
  {"protocol":"all","destination":"0.0.0.0/0","destinationType":"CIDR_BLOCK","description":"all-out"}
]' >/dev/null

echo "Sub-rede publica..."
SUBNET_ID="$(oci network subnet create \
  --compartment-id "$COMPARTMENT_ID" \
  --vcn-id "$VCN_ID" \
  --display-name "$SUBNET_NAME" \
  --cidr-block "$SUBNET_CIDR" \
  --availability-domain "$AD" \
  --route-table-id "$RT_ID" \
  --security-list-ids "[\"$SL_ID\"]" \
  --prohibit-public-ip-on-vnic false \
  --dns-label public \
  --wait-for-state AVAILABLE \
  --query 'data.id' --raw-output)"

echo
echo "Pronto."
echo "VCN:    $VCN_ID"
echo "Subnet: $SUBNET_ID  (publica)"
echo
echo "Volte em Compute -> Create instance:"
echo "  Rede existente = $VCN_NAME"
echo "  Sub-rede existente = $SUBNET_NAME"
echo "  Ligue IPv4 publico."
