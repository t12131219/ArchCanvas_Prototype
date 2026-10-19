"""Static-only examples: callers must never import this module to extract it."""
import torch
from torch import nn


class ShapeDrivenFusion(nn.Module):
    def __init__(self):
        super().__init__()
        self.encoder = nn.TransformerEncoderLayer(8, 2, 16, dropout=0)
        self.recurrent = nn.GRU(8, 8)
        self.weight = nn.Linear(8, 8)

    def forward(self, x):
        tokens = x.view(-1, 4 * 2)
        encoded = self.encoder(tokens)
        sequence, hidden = self.recurrent(encoded)
        gated = torch.sigmoid(self.weight(sequence)) * encoded
        return unfamiliar_fusion(gated, hidden)


class ReturnedDimension(nn.Module):
    def forward(self, x):
        width = 4 * 2
        return x.view(-1, width), width


class ConfigurationBinding(nn.Module):
    def forward(self, x):
        width = 4 * 2
        return x.view(-1, width)


class FeatureCoefficient(nn.Module):
    def forward(self, x):
        coefficient = 4 * 2
        return x * coefficient


class UnknownConfiguration(nn.Module):
    def forward(self, x):
        return custom_view(x, 4 * 2)
