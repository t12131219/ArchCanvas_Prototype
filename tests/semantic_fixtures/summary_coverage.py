"""Static-only unfamiliar compositions for coarse versus detailed expression."""
import torch
from torch import nn


class SourceMosaic(nn.Module):
    def combine(self, x, y):
        a = torch.cos(x)
        b = torch.sin(y)
        return torch.tanh(a) - b - a

    def forward(self, x, y):
        return torch.sigmoid(self.combine(x, y))


class InterruptedMosaic(nn.Module):
    def good(self, x):
        a = torch.cos(x)
        return torch.sin(a) - a

    def bad(self, x):
        return foreign_unknown(torch.sin(x))

    def forward(self, x):
        return self.good(x) + self.bad(x)


class LateMosaic(nn.Module):
    def combine(self, x, context):
        return torch.sin(torch.cos(x)) - context

    def forward(self, x, context):
        return torch.tanh(self.combine(x, context))
