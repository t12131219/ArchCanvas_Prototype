"""A retained independent branch gives detail a different measured cost."""
import torch
from torch import nn


class BranchedMosaic(nn.Module):
    def compact(self, x):
        return torch.tanh(torch.cos(torch.sin(torch.relu(x))))

    def reused(self, x):
        value = torch.sigmoid(x)
        return torch.sin(value) - torch.cos(value)

    def forward(self, x, y):
        left = self.reused(self.compact(x))
        return torch.tanh(left) - torch.cos(torch.sin(y))
