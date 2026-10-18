"""Original unfamiliar composition; analysis reads AST and never imports it."""
import torch
from torch import nn


class GatedMixture(nn.Module):
    def __init__(self):
        super().__init__()
        self.encoder = nn.TransformerEncoderLayer(8, 2, 16, batch_first=True)
        self.sequence = nn.RNN(8, 8, batch_first=True)
        self.left_weight = nn.Linear(8, 8)
        self.right_weight = nn.Linear(8, 8)

    def forward(self, x, previous):
        encoded = self.encoder(x)
        sequence, hidden = self.sequence(encoded)
        left = torch.sigmoid(self.left_weight(sequence)) * previous
        right = torch.sigmoid(self.right_weight(previous)) * torch.tanh(sequence)
        mixed = left + right
        result = unfamiliar_kernel(mixed)
        # A product has an extra consumer outside the sum. Grouping must retain
        # this boundary rather than assume two isolated, independent branches.
        return result, hidden, left
