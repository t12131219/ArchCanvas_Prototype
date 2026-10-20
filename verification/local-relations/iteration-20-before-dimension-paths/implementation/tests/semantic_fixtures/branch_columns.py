"""Unfamiliar independent paths; no family or projection contract is required."""
import torch
from torch import nn


class WovenInputs(nn.Module):
    def forward(self, extra, left, middle, right):
        d = torch.relu(extra)
        a = torch.tanh(torch.relu(left))
        b = torch.sigmoid(torch.sin(middle))
        c = torch.cos(torch.abs(right))
        return torch.cat((a, b, c, d), dim=-1)


class InterruptedPaths(nn.Module):
    def foreign(self, value):
        return external_unresolved(value)

    def forward(self, extra, left, middle, right):
        d = torch.relu(extra)
        a = torch.tanh(torch.relu(left))
        b = self.foreign(torch.sin(middle))
        c = torch.cos(torch.abs(right))
        return torch.cat((a, b, c, d), dim=-1)
