"""An unfamiliar name, a local composition, a shared layer and residual arithmetic."""
import torch
from torch import nn


class LanternUnit(nn.Module):
    def __init__(self, width=16):
        super().__init__()
        self.value = nn.Linear(width, width)
        self.gate = nn.Sequential(nn.Linear(width, width), nn.Sigmoid())

    def forward(self, x):
        value = self.value(x)
        gate = self.gate(x)
        return x + value * gate


class RiverNet(nn.Module):
    def __init__(self, width=16):
        super().__init__()
        self.block = LanternUnit(width)
        self.shared = nn.Linear(width, width)
        self.readout = self.shared
        self.norm = nn.LayerNorm(width)

    def forward(self, features):
        hidden = self.block(features)
        left = self.shared(hidden)
        right = self.readout(features)
        return self.norm(left + right)
