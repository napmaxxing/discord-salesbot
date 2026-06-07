import { parseAbi, parseAbiItem } from "viem";

// ERC721 Transfer has the same topic0 as ERC20 Transfer, but tokenId is indexed.
// We always query with an explicit `address` filter for our watched collections,
// so this only ever matches the NFT contracts we care about.
export const transferEvent = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
);

export const erc721MetadataAbi = parseAbi([
  "function tokenURI(uint256 tokenId) view returns (string)",
  "function name() view returns (string)",
]);
